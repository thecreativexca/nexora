/**
 * Phase 4 - POS register + inventory management integration tests.
 *
 * Requires:
 *   - a seeded development database (npm run seed)
 *   - the dev server running (npm run dev)
 *
 * Run with: npm run test:phase4
 *
 * Covers the Phase 4 access contract end to end over real HTTP: role gates on
 * the register and inventory APIs, selling on the register (stock decrement,
 * receipt shape, audit trail, idempotent replay), inventory create/update
 * with slug/SKU uniqueness and targeted stock edits, and GridFS uploads.
 */
import bcrypt from "bcryptjs";

import { BCRYPT_ROUNDS } from "@/lib/constants/customer";
import { STAFF_SESSION_COOKIE } from "@/lib/constants/staff";
import { AUDIT_ACTION } from "@/lib/constants/audit";
import { ORDER_CHANNEL, ORDER_STATUS, PAYMENT_STATUS } from "@/lib/constants/order";
import { connectDB, disconnectDB } from "@/lib/db/mongodb";
import { AuditLog } from "@/models/AuditLog";
import { Category } from "@/models/Category";
import { Order } from "@/models/Order";
import { Product } from "@/models/Product";
import { StaffProfile } from "@/models/StaffProfile";
import { loadEnvFiles } from "@/scripts/load-env";

const BASE_URL = process.env.NEXORA_TEST_BASE_URL ?? "http://localhost:3000";
const PASSWORD = "Secret@12345";

let passed = 0;
const failures: string[] = [];

async function check(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures.push(name);
    const message = error instanceof Error ? error.message : String(error);
    console.error(`  FAIL ${name}\n         ${message}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function unique(label: string): string {
  return `ph4-${label}-${Date.now()}-${Math.floor(Math.random() * 1e5)}`;
}

/** Short random token that differs every call (used inside SKUs). */
function token(length = 6): string {
  return Math.random().toString(36).slice(2, 2 + length);
}

function uniqueEmail(): string {
  return `${unique("staff")}@nexora.example`;
}

/* ---------------------------------------------------------------------------
 * HTTP harness (same cookie-jar pattern as Phase 3)
 * ------------------------------------------------------------------------- */

interface Cookie {
  name: string;
  value: string;
  expires: number;
  isExpired: boolean;
}

function parseSetCookies(response: Response): Cookie[] {
  const raw =
    typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  const cookies: Cookie[] = [];
  for (const line of raw) {
    const segments = line.split(/;\s*/);
    const [pair] = segments;
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const name = pair.slice(0, eq);
    const value = pair.slice(eq + 1);
    const expiresMatch = line.match(/expires=([^;]+)/i);
    const expires = expiresMatch ? Date.parse(expiresMatch[1]) : Number.NaN;
    cookies.push({
      name,
      value,
      expires,
      isExpired: Number.isFinite(expires) && expires <= Date.now(),
    });
  }
  return cookies;
}

type CookieJar = Record<string, string>;

function cookieHeader(jar: CookieJar | undefined): string {
  if (!jar) return "";
  return Object.entries(jar)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function applySetCookies(jar: CookieJar, response: Response): void {
  for (const cookie of parseSetCookies(response)) {
    if (cookie.isExpired) delete jar[cookie.name];
    else jar[cookie.name] = cookie.value;
  }
}

async function api(
  path: string,
  options: { method?: string; body?: unknown; jar?: CookieJar; form?: FormData } = {},
): Promise<{ status: number; body: Record<string, unknown>; response: Response }> {
  const headers: Record<string, string> = {};
  const cookie = cookieHeader(options.jar);
  if (cookie) headers.Cookie = cookie;

  let body: BodyInit | undefined;
  if (options.form) {
    body = options.form;
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body,
    redirect: "manual",
  });

  if (options.jar) applySetCookies(options.jar, response);

  const text = await response.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    parsed = { raw: text };
  }
  return { status: response.status, body: parsed, response };
}

function hasSession(jar: CookieJar): boolean {
  return Boolean(jar[STAFF_SESSION_COOKIE]);
}

/* ---------------------------------------------------------------------------
 * Fixtures + tracked rows (cleanup only touches what this run created)
 * ------------------------------------------------------------------------- */

const createdStaffEmails: string[] = [];
const createdCategoryIds: string[] = [];
const createdProductIds: string[] = [];
const createdOrderNumbers: string[] = [];

async function insertStaff(input: {
  name: string;
  email: string;
  role: "SUPER_ADMIN" | "MANAGER" | "CASHIER";
}): Promise<string> {
  const passwordHash = await bcrypt.hash(PASSWORD, BCRYPT_ROUNDS);
  const staff = await StaffProfile.create({
    email: input.email,
    passwordHash,
    name: input.name,
    role: input.role,
    isActive: true,
    lastLoginAt: null,
    passwordChangedAt: new Date(),
    failedLoginCount: 0,
    lockedUntil: null,
    invitedBy: null,
  });
  createdStaffEmails.push(input.email);
  return String(staff._id);
}

async function fullSignIn(email: string): Promise<CookieJar> {
  const jar: CookieJar = {};

  const login = await api("/api/staff/login", {
    method: "POST",
    body: { email, password: PASSWORD },
    jar,
  });
  assertEqual(login.status, 200, "login status");
  assertEqual(login.body.step as string, "COMPLETE", "next step");

  assert(hasSession(jar), "full session held");
  return jar;
}

async function createCategory(): Promise<string> {
  const category = await Category.create({
    name: unique("cat"),
    slug: unique("catslug"),
    description: "Phase 4 test category",
    image: "",
    isActive: true,
  });
  createdCategoryIds.push(String(category._id));
  return String(category._id);
}

async function createProduct(input: {
  name: string;
  sku: string;
  priceInPaise: number;
  costInPaise?: number;
  stock?: number;
  category: string;
  isService?: boolean;
  isActive?: boolean;
}): Promise<string> {
  const product = await Product.create({
    name: input.name,
    slug: unique("prodslug"),
    description: "",
    priceInPaise: input.priceInPaise,
    costInPaise: input.costInPaise ?? 0,
    sku: input.sku.toUpperCase(),
    stock: input.stock ?? 0,
    category: input.category,
    image: "",
    images: [],
    isActive: input.isActive ?? true,
    isFeatured: false,
    isService: input.isService ?? false,
  });
  createdProductIds.push(String(product._id));
  return String(product._id);
}

/** Ring up a sale via the API and remember the resulting order number. */
async function posSale(
  jar: CookieJar,
  body: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await api("/api/pos/sales", { method: "POST", jar, body });
  const receipt = response.body.receipt as Record<string, unknown> | undefined;
  if (receipt?.orderNumber) createdOrderNumbers.push(receipt.orderNumber as string);
  return { status: response.status, body: response.body };
}

/* ---------------------------------------------------------------------------
 * Test groups
 * ------------------------------------------------------------------------- */

async function runRegisterTests(cashierJar: CookieJar): Promise<{
  categoryId: string;
  physicalId: string;
  serviceId: string;
}> {
  console.log("\nPOS register");

  await check("anonymous callers cannot read the register shelf", async () => {
    const response = await api("/api/pos/products");
    assertEqual(response.status, 401, "anonymous GET rejected");
  });

  await check("anonymous callers cannot ring up a sale", async () => {
    const response = await api("/api/pos/sales", { method: "POST", body: { items: [] } });
    assertEqual(response.status, 401, "anonymous POST rejected");
  });

  const categoryId = await createCategory();
  const physicalName = `Espresso Test ${unique("px")}`;
  const physicalId = await createProduct({
    name: physicalName,
    sku: `ESP-${token(8)}`,
    priceInPaise: 12900,
    costInPaise: 6000,
    stock: 3,
    category: categoryId,
  });
  const serviceName = `Tailor Fitting Test ${unique("sx")}`;
  const serviceId = await createProduct({
    name: serviceName,
    sku: `SRV-${token(8)}`,
    priceInPaise: 5000,
    stock: 0,
    category: categoryId,
    isService: true,
  });

  await check("a cashier can read the register shelf", async () => {
    // Search narrows the grid to exactly the fixture rows, so page ordering can
    // never hide them behind the rest of the catalogue.
    const physicalShelf = await api(
      `/api/pos/products?q=${encodeURIComponent(physicalName)}`,
      { jar: cashierJar },
    );
    assertEqual(physicalShelf.status, 200, "shelf status");
    const physicalRows = (physicalShelf.body.products as Array<Record<string, unknown>>) ?? [];
    const physical = physicalRows.find((row) => row.id === physicalId);
    assert(Boolean(physical), "new physical product appears on the shelf");
    assertEqual(physical?.maxOrderable, 3, "physical max = stock");
    assert(!("costInPaise" in (physical ?? {})), "register never exposes cost");

    const serviceShelf = await api(
      `/api/pos/products?q=${encodeURIComponent(serviceName)}`,
      { jar: cashierJar },
    );
    const serviceRows = (serviceShelf.body.products as Array<Record<string, unknown>>) ?? [];
    const service = serviceRows.find((row) => row.id === serviceId);
    assert(Boolean(service), "new service appears on the shelf");
    assertEqual(service?.maxOrderable, null, "service has no stock ceiling");
  });

  await check("ringing up a sale completes the order and decrements stock", async () => {
    const sale = await posSale(cashierJar, {
      items: [
        { productId: physicalId, quantity: 2 },
        { productId: serviceId, quantity: 1 },
      ],
      customerName: "Walk-in",
      customerEmail: "",
      paymentMethod: "CASH",
      idempotencyKey: `sale-${unique("idem")}`,
    });
    assertEqual(sale.status, 201, "sale status");
    const receipt = sale.body.receipt as Record<string, unknown>;
    assertEqual(receipt.status, ORDER_STATUS.COMPLETED, "sale completes immediately");
    assertEqual(receipt.paymentStatus, PAYMENT_STATUS.PAID, "sale is marked paid");
    assertEqual(receipt.paymentMethod, "CASH", "payment method recorded");
    assertEqual(receipt.staffName, "Phase Four Cashier", "staff snapshot on receipt");
    assertEqual(receipt.totalInPaise, 12900 * 2 + 5000, "server recomputes the total");
    assertEqual(receipt.itemCount, 3, "item count");
    assert((receipt.orderNumber as string).startsWith("NX-"), "order number format");

    const physical = await Product.findById(physicalId).lean();
    assertEqual(physical?.stock, 1, "physical stock decremented from 3 to 1");
    const service = await Product.findById(serviceId).lean();
    assertEqual(service?.stock, 0, "service stock untouched");
  });

  await check("the POS order is stored as an IN_STORE completed order", async () => {
    const order = await Order.findOne({ orderNumber: createdOrderNumbers[0] }).lean();
    assert(Boolean(order), "order row exists");
    assertEqual(order?.channel, ORDER_CHANNEL.IN_STORE, "channel is IN_STORE");
    assertEqual(order?.placedByName, "Phase Four Cashier", "placedByName snapshot stored");
    assert(Boolean(order?.placedByStaffId), "placedByStaffId recorded");
  });

  await check("the sale writes a POS_SALE_COMPLETED audit entry", async () => {
    const entry = await AuditLog.findOne({
      action: AUDIT_ACTION.POS_SALE_COMPLETED,
      "metadata.orderNumber": createdOrderNumbers[0],
    })
      .sort({ createdAt: -1 })
      .lean();
    assert(Boolean(entry), "audit entry exists");
  });

  await check("re-submitting the same sale key replays instead of double-charging", async () => {
    const key = `sale-${unique("replay")}`;
    const first = await posSale(cashierJar, {
      items: [{ productId: physicalId, quantity: 1 }],
      customerName: "Walker",
      paymentMethod: "CARD",
      idempotencyKey: key,
    });
    assertEqual(first.status, 201, "first submit creates the sale");
    const countAfterFirst = (await Product.findById(physicalId).lean())?.stock;

    const replay = await posSale(cashierJar, {
      items: [{ productId: physicalId, quantity: 1 }],
      customerName: "Walker",
      paymentMethod: "CARD",
      idempotencyKey: key,
    });
    assertEqual(replay.status, 201, "replay is accepted, not rejected");
    const replayReceipt = replay.body.receipt as Record<string, unknown>;
    assertEqual(
      replayReceipt.orderNumber,
      (first.body.receipt as Record<string, unknown>).orderNumber,
      "same order returned",
    );
    assertEqual(replayReceipt.replayed, true, "replay flagged");
    const countAfterReplay = (await Product.findById(physicalId).lean())?.stock;
    assertEqual(countAfterReplay, countAfterFirst, "stock not decremented twice");
  });

  await check("overselling a physical item is rejected", async () => {
    const sale = await posSale(cashierJar, {
      items: [{ productId: physicalId, quantity: 99 }],
      paymentMethod: "CASH",
      idempotencyKey: `sale-${unique("oversell")}`,
    });
    assertEqual(sale.status, 409, "insufficient stock -> 409");
  });

  await check("an empty sale is rejected", async () => {
    const sale = await posSale(cashierJar, {
      items: [],
      paymentMethod: "CASH",
    });
    assertEqual(sale.status, 400, "empty items -> 400");
  });

  await check("an unknown product in a sale is rejected", async () => {
    const sale = await posSale(cashierJar, {
      items: [{ productId: "0".repeat(24), quantity: 1 }],
      paymentMethod: "CASH",
    });
    assertEqual(sale.status, 404, "missing product -> 404");
  });

  await check("an invalid payment method is rejected", async () => {
    const sale = await posSale(cashierJar, {
      items: [{ productId: physicalId, quantity: 1 }],
      paymentMethod: "UPI",
    });
    assertEqual(sale.status, 400, "non-POS method -> 400");
  });

  return { categoryId, physicalId, serviceId };
}

async function runInventoryTests(
  cashierJar: CookieJar,
  managerJar: CookieJar,
  categoryId: string,
  cashierTargetId: string,
): Promise<void> {
  console.log("\nInventory management");

  await check("anonymous callers cannot read inventory", async () => {
    const response = await api("/api/pos/inventory");
    assertEqual(response.status, 401, "anonymous GET rejected");
  });

  await check("cashiers cannot read inventory", async () => {
    const response = await api("/api/pos/inventory", { jar: cashierJar });
    assertEqual(response.status, 403, "cashier GET rejected");
  });

  await check("cashiers cannot create products", async () => {
    const response = await api("/api/pos/inventory", {
      method: "POST",
      jar: cashierJar,
      body: {
        name: "Nope",
        sku: "NOPE-1",
        priceInPaise: 100,
        stock: 0,
        category: categoryId,
      },
    });
    assertEqual(response.status, 403, "cashier POST rejected");
  });

  await check("cashiers cannot update products", async () => {
    const response = await api(`/api/pos/inventory/${cashierTargetId}`, {
      method: "PATCH",
      jar: cashierJar,
      body: { stock: 7 },
    });
    assertEqual(response.status, 403, "cashier PATCH rejected");
  });

  let createdId = "";
  const newSku = `ADD-${token(8)}`;
  await check("a manager can create a product with cost", async () => {
    const response = await api("/api/pos/inventory", {
      method: "POST",
      jar: managerJar,
      body: {
        name: `Cold Brew Test ${unique("cbx")}`,
        sku: newSku,
        priceInPaise: 8900,
        costInPaise: 4000,
        stock: 12,
        category: categoryId,
        image: "",
        isActive: true,
        isFeatured: false,
        isService: false,
      },
    });
    assertEqual(response.status, 201, "create status");
    const product = response.body.product as Record<string, unknown>;
    assertEqual(product.costInPaise, 4000, "cost returned to staff");
    assertEqual(product.stock, 12, "stock stored");
    createdProductIds.push(product.id as string);
    createdId = product.id as string;
  });

  await check("a duplicate SKU is rejected with SKU_TAKEN", async () => {
    const response = await api("/api/pos/inventory", {
      method: "POST",
      jar: managerJar,
      body: {
        name: `Other Name ${unique("cbx")}`,
        sku: newSku,
        priceInPaise: 100,
        stock: 1,
        category: categoryId,
      },
    });
    assertEqual(response.status, 409, "duplicate sku status");
    assertEqual((response.body.error as { code?: string }).code, "SKU_TAKEN", "error code");
  });

  await check("a duplicate product name is rejected with SLUG_TAKEN", async () => {
    const firstName = `Triple Shot ${unique("ts")}`;
    const first = await api("/api/pos/inventory", {
      method: "POST",
      jar: managerJar,
      body: {
        name: firstName,
        sku: `TS-${token(6)}`,
        priceInPaise: 100,
        stock: 1,
        category: categoryId,
      },
    });
    assertEqual(first.status, 201, "first create status");
    createdProductIds.push((first.body.product as { id: string }).id);
    const second = await api("/api/pos/inventory", {
      method: "POST",
      jar: managerJar,
      body: {
        name: firstName,
        sku: `TS2-${token(6)}`,
        priceInPaise: 100,
        stock: 1,
        category: categoryId,
      },
    });
    assertEqual(second.status, 409, "duplicate name status");
    assertEqual((second.body.error as { code?: string }).code, "SLUG_TAKEN", "error code");
  });

  await check("a manager can update just the stock (targeted patch)", async () => {
    const response = await api(`/api/pos/inventory/${createdId}`, {
      method: "PATCH",
      jar: managerJar,
      body: { stock: 5 },
    });
    assertEqual(response.status, 200, "update status");
    assertEqual((response.body.product as { stock: number }).stock, 5, "stock updated");
  });

  await check("a stock change writes a STOCK_ADJUSTED audit entry", async () => {
    const entry = await AuditLog.findOne({
      action: AUDIT_ACTION.STOCK_ADJUSTED,
      "metadata.productId": createdId,
    })
      .sort({ createdAt: -1 })
      .lean();
    assert(Boolean(entry), "STOCK_ADJUSTED audit entry exists");
    const metadata = entry?.metadata as Record<string, unknown>;
    assertEqual(metadata.previousStock, 12, "previous stock in metadata");
    assertEqual(metadata.newStock, 5, "new stock in metadata");
  });

  await check("editing a product writes a PRODUCT_UPDATED audit entry", async () => {
    await api(`/api/pos/inventory/${createdId}`, {
      method: "PATCH",
      jar: managerJar,
      body: { name: `Cold Brew Renamed ${unique("rbx")}` },
    });
    const entry = await AuditLog.findOne({
      action: AUDIT_ACTION.PRODUCT_UPDATED,
      "metadata.productId": createdId,
    })
      .sort({ createdAt: -1 })
      .lean();
    assert(Boolean(entry), "PRODUCT_UPDATED audit entry exists");
  });

  await check("an unknown category is rejected", async () => {
    const response = await api("/api/pos/inventory", {
      method: "POST",
      jar: managerJar,
      body: {
        name: `Phantom Category ${unique("pc")}`,
        sku: `PH-${token(6)}`,
        priceInPaise: 100,
        stock: 1,
        category: "0".repeat(24),
      },
    });
    assertEqual(response.status, 400, "unknown category status");
    assertEqual((response.body.error as { code?: string }).code, "CATEGORY_NOT_FOUND", "error code");
  });

  await check("deactivating a product hides it from the register shelf", async () => {
    await api(`/api/pos/inventory/${createdId}`, {
      method: "PATCH",
      jar: managerJar,
      body: { isActive: false },
    });
    const shelf = await api("/api/pos/products", { jar: cashierJar });
    const rows = (shelf.body.products as Array<Record<string, unknown>>) ?? [];
    assert(!rows.some((row) => row.id === createdId), "inactive product absent from shelf");

    const inventory = await api("/api/pos/inventory", { jar: managerJar });
    const inventoryRows = (inventory.body.products as Array<Record<string, unknown>>) ?? [];
    assert(inventoryRows.some((row) => row.id === createdId), "still visible in inventory");
  });

  await check("the inventory list carries cost and category name", async () => {
    const response = await api(`/api/pos/inventory?q=${encodeURIComponent("Cold Brew")}`, {
      jar: managerJar,
    });
    const rows = (response.body.products as Array<Record<string, unknown>>) ?? [];
    for (const row of rows) {
      assert("costInPaise" in row, "cost present in inventory rows");
      assert(
        typeof row.categoryName === "string" && row.categoryName.length > 0,
        "category name present",
      );
    }
  });

  await check("cashiers cannot upload product images", async () => {
    const form = new FormData();
    form.append("file", new File([new Uint8Array([137, 80, 78, 71])], "tiny.png", { type: "image/png" }));
    const response = await api("/api/pos/inventory/images", {
      method: "POST",
      jar: cashierJar,
      form,
    });
    assertEqual(response.status, 403, "cashier upload rejected");
  });

  let uploadedUrl = "";
  await check("a manager can upload a product image to GridFS", async () => {
    const pixel = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    const form = new FormData();
    form.append("file", new File([pixel], "pixel.png", { type: "image/png" }));
    const response = await api("/api/pos/inventory/images", {
      method: "POST",
      jar: managerJar,
      form,
    });
    assertEqual(response.status, 201, "upload status");
    uploadedUrl = response.body.imageUrl as string;
    assert(uploadedUrl.startsWith("/api/pos/images/"), "served image URL shape");

    const imageResponse = await fetch(`${BASE_URL}${uploadedUrl}`);
    assertEqual(imageResponse.status, 200, "image streams back");
    assertEqual(imageResponse.headers.get("content-type"), "image/png", "mime preserved");
  });

  await check("a manager can attach the uploaded image to a product", async () => {
    const response = await api(`/api/pos/inventory/${createdId}`, {
      method: "PATCH",
      jar: managerJar,
      body: { image: uploadedUrl },
    });
    assertEqual(response.status, 200, "patch status");
    assertEqual((response.body.product as { image: string }).image, uploadedUrl, "image stored");
  });
}

async function cleanup(): Promise<void> {
  try {
    const staff = await StaffProfile.find({ email: { $in: createdStaffEmails } })
      .select("_id email")
      .lean<{ _id: string; email: string }[]>();
    const staffIds = staff.map((member) => member._id);

    const [deletedProducts, deletedCategories, deletedOrders, deletedAudit, deletedStaff] =
      await Promise.all([
        Product.deleteMany({ _id: { $in: createdProductIds } }),
        Category.deleteMany({ _id: { $in: createdCategoryIds } }),
        Order.deleteMany({ orderNumber: { $in: createdOrderNumbers } }),
        AuditLog.deleteMany({
          $or: [
            { actorStaffId: { $in: staffIds } },
            { "metadata.orderNumber": { $in: createdOrderNumbers } },
            { "metadata.productId": { $in: createdProductIds } },
          ],
        }),
        StaffProfile.deleteMany({ email: { $in: createdStaffEmails } }),
      ]);

    console.log(
      `[cleanup] removed ${deletedProducts.deletedCount} products, ${deletedCategories.deletedCount} categories, ${deletedOrders.deletedCount} orders, ${deletedAudit.deletedCount} audit entries, ${deletedStaff.deletedCount} staff`,
    );
  } catch (error) {
    console.error("[cleanup] failed", error);
  }
}

async function main(): Promise<void> {
  loadEnvFiles();
  await connectDB();

  try {
    const managerEmail = uniqueEmail();
    await insertStaff({ name: "Phase Four Manager", email: managerEmail, role: "MANAGER" });
    const managerJar = await fullSignIn(managerEmail);

    const cashierEmail = uniqueEmail();
    await insertStaff({ name: "Phase Four Cashier", email: cashierEmail, role: "CASHIER" });
    const cashierJar = await fullSignIn(cashierEmail);

    const register = await runRegisterTests(cashierJar);
    await runInventoryTests(cashierJar, managerJar, register.categoryId, register.physicalId);
  } finally {
    await cleanup();
    await disconnectDB();
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.error(`Failed checks:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
}

main().catch(async (error: unknown) => {
  console.error(error);
  await cleanup().catch(() => undefined);
  await disconnectDB().catch(() => undefined);
  process.exit(1);
});