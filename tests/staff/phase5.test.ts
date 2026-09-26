/**
 * Phase 5 - Orders management + refunds + reports integration tests.
 *
 * Requires:
 *   - a seeded development database (npm run seed)
 *   - the dev server running (npm run dev)
 *   - Business timezone default (BUSINESS_TIMEZONE) available via .env.local
 *
 * Run with: npm run test:phase5
 *
 * Covers the Phase 5 access contract end to end over real HTTP: order list,
 * filter/search/pagination, detail, the controlled ONLINE delivery workflow
 * (manager-only, illegal transitions rejected), permanent full-order refunds
 * (transactional stock restore, double-refund rejection, missing-product
 * handling) and the MongoDB-aggregated reports dashboard.
 */
import bcrypt from "bcryptjs";
import { Secret, TOTP } from "otpauth";

import { BCRYPT_ROUNDS } from "@/lib/constants/customer";
import { STAFF_SESSION_COOKIE } from "@/lib/constants/staff";
import { AUDIT_ACTION } from "@/lib/constants/audit";
import {
  ORDER_CHANNEL,
  ORDER_STATUS,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  REFUND_STATUS,
  type OrderStatus,
} from "@/lib/constants/order";
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
  return `ph5-${label}-${Date.now()}-${Math.floor(Math.random() * 1e5)}`;
}

/** Short random token that differs every call (used inside SKUs). */
function token(length = 6): string {
  return Math.random().toString(36).slice(2, 2 + length);
}

function uniqueEmail(): string {
  return `${unique("staff")}@nexora.example`;
}

/** Well-formed order number in the real NX-YYYYMMDD-XXXXXX format. */
function fixtureOrderNumber(): string {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const date = new Date();
  const datePart = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("");
  let randomPart = "";
  for (let index = 0; index < 6; index += 1) {
    randomPart += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `NX-${datePart}-${randomPart}`;
}

function codeForSecret(secret: string): string {
  return new TOTP({
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  }).generate();
}

/* ---------------------------------------------------------------------------
 * HTTP harness (same cookie-jar pattern as Phases 3/4)
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
  options: { method?: string; body?: unknown; jar?: CookieJar } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers: Record<string, string> = {};
  const cookie = cookieHeader(options.jar);
  if (cookie) headers.Cookie = cookie;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(`${BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
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
  return { status: response.status, body: parsed };
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
    mfaEnabled: false,
    mfaSecretEncrypted: null,
    mfaVerifiedAt: null,
    lastLoginAt: null,
    passwordChangedAt: new Date(),
    failedLoginCount: 0,
    lockedUntil: null,
    invitedBy: null,
  });
  createdStaffEmails.push(input.email);
  return String(staff._id);
}

async function fullSignIn(email: string, wantsMfa: boolean): Promise<CookieJar> {
  const jar: CookieJar = {};

  const login = await api("/api/staff/login", {
    method: "POST",
    body: { email, password: PASSWORD },
    jar,
  });
  assertEqual(login.status, 200, "login status");
  assertEqual(login.body.step as string, wantsMfa ? "MFA_SETUP" : "COMPLETE", "next step");

  if (wantsMfa) {
    const setup = await api("/api/staff/mfa/setup", { method: "POST", body: {}, jar });
    assertEqual(setup.status, 200, "mfa setup status");
    const verify = await api("/api/staff/mfa/verify", {
      method: "POST",
      body: { code: codeForSecret(setup.body.secret as string) },
      jar,
    });
    assertEqual(verify.status, 200, "mfa verify status");
  }

  assert(hasSession(jar), "full session held");
  return jar;
}

async function createCategory(): Promise<string> {
  const category = await Category.create({
    name: unique("cat"),
    slug: unique("catslug"),
    description: "Phase 5 test category",
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
  stock?: number;
  category: string;
  isService?: boolean;
}): Promise<string> {
  const product = await Product.create({
    name: input.name,
    slug: unique("prodslug"),
    description: "",
    priceInPaise: input.priceInPaise,
    costInPaise: 3000,
    sku: input.sku.toUpperCase(),
    stock: input.stock ?? 0,
    category: input.category,
    image: "",
    images: [],
    isActive: true,
    isFeatured: false,
    isService: input.isService ?? false,
  });
  createdProductIds.push(String(product._id));
  return String(product._id);
}

async function createOnlineOrder(input: {
  items: { productId: string; productName: string; sku: string; quantity: number; unitPriceInPaise: number; isService?: boolean }[];
  orderNumber?: string;
  status?: OrderStatus;
  customerName?: string;
  customerEmail?: string;
}): Promise<string> {
  const order = await Order.create({
    orderNumber: input.orderNumber ?? fixtureOrderNumber(),
    channel: ORDER_CHANNEL.ONLINE,
    status: input.status ?? ORDER_STATUS.ORDER_PLACED,
    paymentMethod: PAYMENT_METHOD.PAY_ON_DELIVERY,
    paymentStatus: PAYMENT_STATUS.PAID,
    customerId: null,
    customerName: input.customerName ?? "Phase Five Customer",
    customerEmail: input.customerEmail ?? `${unique("cust")}@nexora.example`,
    customerPhone: "9999999999",
    deliveryAddress: {
      line1: "12 Market Road",
      line2: "",
      city: "Mumbai",
      state: "Maharashtra",
      postalCode: "400001",
      country: "India",
    },
    items: input.items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      sku: item.sku,
      image: "",
      quantity: item.quantity,
      unitPriceInPaise: item.unitPriceInPaise,
      lineTotalInPaise: item.unitPriceInPaise * item.quantity,
      isService: item.isService ?? false,
    })),
    subtotalInPaise: input.items.reduce(
      (sum, item) => sum + item.unitPriceInPaise * item.quantity,
      0,
    ),
    discountInPaise: 0,
    taxInPaise: 0,
    totalInPaise: input.items.reduce(
      (sum, item) => sum + item.unitPriceInPaise * item.quantity,
      0,
    ),
    refundedTotalInPaise: 0,
    refunds: [],
    // Omit idempotencyKey entirely: the sparse unique index still indexes an
    // explicit null and would make every fixture order collide.
    notes: "",
    placedByStaffId: null,
    placedByName: "",
  });
  createdOrderNumbers.push(order.orderNumber);
  return order.orderNumber;
}

async function createInStoreOrder(input: {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPriceInPaise: number;
  staffId: string;
  staffName: string;
}): Promise<string> {
  const order = await Order.create({
    orderNumber: fixtureOrderNumber(),
    channel: ORDER_CHANNEL.IN_STORE,
    status: ORDER_STATUS.COMPLETED,
    paymentMethod: PAYMENT_METHOD.CASH,
    paymentStatus: PAYMENT_STATUS.PAID,
    customerId: null,
    customerName: "Walk-in",
    customerEmail: "",
    customerPhone: "",
    items: [
      {
        productId: input.productId,
        productName: input.productName,
        sku: input.sku,
        image: "",
        quantity: input.quantity,
        unitPriceInPaise: input.unitPriceInPaise,
        lineTotalInPaise: input.unitPriceInPaise * input.quantity,
        isService: false,
      },
    ],
    subtotalInPaise: input.unitPriceInPaise * input.quantity,
    discountInPaise: 0,
    taxInPaise: 0,
    totalInPaise: input.unitPriceInPaise * input.quantity,
    refundedTotalInPaise: 0,
    refunds: [],
    notes: "",
    placedByStaffId: input.staffId,
    placedByName: input.staffName,
  });
  createdOrderNumbers.push(order.orderNumber);
  return order.orderNumber;
}

function ordersOf(body: Record<string, unknown>): Array<Record<string, unknown>> {
  return (body.orders as Array<Record<string, unknown>>) ?? [];
}

/**
 * Reports read the whole Order collection, so a seeded development database
 * (e.g. the demo account orders from `npm run seed:accounts`) already contains
 * qualifying ONLINE orders. Phase 5 therefore compares report output against a
 * baseline captured before the fixture orders exist and asserts the deltas this
 * run introduced, instead of assuming the collection starts empty.
 */
interface ReportBaseline {
  onlineOrderCount: number;
  onlineRevenueInPaise: number;
  inStoreOrderCount: number;
  refundedCount: number;
  totalRevenueInPaise: number;
  totalOrderCount: number;
}

async function readReportBaseline(managerJar: CookieJar): Promise<ReportBaseline> {
  const response = await api("/api/pos/reports", { jar: managerJar });
  assertEqual(response.status, 200, "baseline reports status");
  const report = response.body.report as Record<string, unknown>;
  const channel = report.channelBreakdown as Record<string, unknown>;
  const online = channel.online as Record<string, unknown>;
  const inStore = channel.inStore as Record<string, unknown>;
  return {
    onlineOrderCount: (online.orderCount as number) ?? 0,
    onlineRevenueInPaise: (online.revenueInPaise as number) ?? 0,
    inStoreOrderCount: (inStore.orderCount as number) ?? 0,
    refundedCount: (channel.refundedCount as number) ?? 0,
    totalRevenueInPaise: (report.totalRevenueInPaise as number) ?? 0,
    totalOrderCount: (report.totalOrderCount as number) ?? 0,
  };
}

/* ---------------------------------------------------------------------------
 * Test groups
 * ------------------------------------------------------------------------- */

// Tracked fixtures built once in main() and used across groups.
const fixtures: {
  onlineRefundOrder: string;
  onlineTransitionOrder: string;
  onlineMissingProductOrder: string;
  inStoreOrder: string;
  productId: string;
  missingProductId: string;
  categoryId: string;
  staffId: string;
} = {
  onlineRefundOrder: "",
  onlineTransitionOrder: "",
  onlineMissingProductOrder: "",
  inStoreOrder: "",
  productId: "",
  missingProductId: "",
  categoryId: "",
  staffId: "",
};

async function runOrdersListTests(cashierJar: CookieJar): Promise<void> {
  console.log("\nOrders management - list / detail");

  await check("anonymous callers cannot list orders", async () => {
    const response = await api("/api/pos/orders");
    assertEqual(response.status, 401, "anonymous GET rejected");
  });

  await check("anonymous callers cannot read order detail", async () => {
    const response = await api(`/api/pos/orders/${fixtures.onlineRefundOrder}`);
    assertEqual(response.status, 401, "anonymous detail rejected");
  });

  await check("a cashier can list orders across both channels", async () => {
    const response = await api("/api/pos/orders", { jar: cashierJar });
    assertEqual(response.status, 200, "list status");
    const rows = ordersOf(response.body);
    assert(rows.length >= 3, "fixture orders present");
    const row = rows.find((entry) => entry.orderNumber === fixtures.onlineRefundOrder);
    assert(Boolean(row), "online order in list");
    assertEqual(row?.channel, ORDER_CHANNEL.ONLINE, "channel recorded");
    assertEqual(row?.status, ORDER_STATUS.ORDER_PLACED, "status recorded");
    assert("totalInPaise" in (row ?? {}), "total present");
    assert(!("refunds" in (row ?? {})), "list rows never expose refund internals");
  });

  await check("channel filter isolates in-store orders", async () => {
    const response = await api("/api/pos/orders?channel=IN_STORE", { jar: cashierJar });
    assertEqual(response.status, 200, "filter status");
    const rows = ordersOf(response.body);
    assert(rows.some((entry) => entry.orderNumber === fixtures.inStoreOrder), "store order shown");
    assert(
      !rows.some((entry) => entry.orderNumber === fixtures.onlineRefundOrder),
      "online order hidden by channel filter",
    );
  });

  await check("status filter isolates placed orders", async () => {
    const response = await api("/api/pos/orders?status=ORDER_PLACED", { jar: cashierJar });
    assertEqual(response.status, 200, "filter status");
    const rows = ordersOf(response.body);
    assert(
      rows.some((entry) => entry.orderNumber === fixtures.onlineTransitionOrder),
      "placed order shown",
    );
    assert(
      !rows.some((entry) => entry.orderNumber === fixtures.inStoreOrder),
      "completed order hidden by status filter",
    );
  });

  await check("order-number search finds the exact order", async () => {
    const term = fixtures.onlineRefundOrder.slice(0, 8);
    const response = await api(
      `/api/pos/orders?search=${encodeURIComponent(term)}`,
      { jar: cashierJar },
    );
    assertEqual(response.status, 200, "search status");
    const rows = ordersOf(response.body);
    assert(rows.some((entry) => entry.orderNumber === fixtures.onlineRefundOrder), "match found");
    assert(
      rows.every((entry) => String(entry.orderNumber).startsWith(term)),
      "search is anchored, not fuzzy",
    );
  });

  await check("regex metacharacters cannot widen the search", async () => {
    const response = await api("/api/pos/orders?search=.*", { jar: cashierJar });
    assertEqual(response.status, 200, "search status");
    assertEqual(ordersOf(response.body).length, 0, "escaped pattern matches nothing");
  });

  await check("pageSize is capped server-side", async () => {
    const response = await api("/api/pos/orders?pageSize=99999", { jar: cashierJar });
    assertEqual(response.status, 200, "list status");
    assertEqual(response.body.pageSize, 50, "pageSize capped at ORDERS_MAX_PAGE_SIZE");
  });

  await check("invalid channel/status/search params are rejected", async () => {
    const badChannel = await api("/api/pos/orders?channel=BOGUS", { jar: cashierJar });
    assertEqual(badChannel.status, 400, "bad channel -> 400");
    const badStatus = await api("/api/pos/orders?status=BOGUS", { jar: cashierJar });
    assertEqual(badStatus.status, 400, "bad status -> 400");
    const longSearch = await api(
      `/api/pos/orders?search=${"a".repeat(41)}`,
      { jar: cashierJar },
    );
    assertEqual(longSearch.status, 400, "overlong search -> 400");
  });

  await check("order detail returns the full snapshot", async () => {
    const response = await api(`/api/pos/orders/${fixtures.onlineRefundOrder}`, {
      jar: cashierJar,
    });
    assertEqual(response.status, 200, "detail status");
    const order = response.body.order as Record<string, unknown>;
    assertEqual(order.orderNumber, fixtures.onlineRefundOrder, "order number");
    assertEqual(order.channel, ORDER_CHANNEL.ONLINE, "channel");
    assertEqual(order.paymentMethod, PAYMENT_METHOD.PAY_ON_DELIVERY, "payment method");
    assertEqual(order.paymentStatus, PAYMENT_STATUS.PAID, "payment status");
    assert((order.items as unknown[]).length >= 1, "item snapshots present");
    const address = order.deliveryAddress as Record<string, unknown>;
    assertEqual(address.city, "Mumbai", "delivery address snapshot");
    assertEqual(order.refunded, false, "not yet refunded");
    assertEqual(
      (order.allowedNextStatuses as string[])[0],
      ORDER_STATUS.PREPARING,
      "placed online order can move to preparing",
    );
  });

  await check("order detail lookups are case-insensitive on the number", async () => {
    const lower = fixtures.onlineRefundOrder.toLowerCase();
    const response = await api(`/api/pos/orders/${lower}`, { jar: cashierJar });
    assertEqual(response.status, 200, "lowercase lookup still resolves");
  });

  await check("a nonexistent order returns 404", async () => {
    const response = await api("/api/pos/orders/NX-20000101-ZZZZZZ", { jar: cashierJar });
    assertEqual(response.status, 404, "missing order -> 404");
  });

  await check("an in-store order detail has no delivery workflow", async () => {
    const response = await api(`/api/pos/orders/${fixtures.inStoreOrder}`, {
      jar: cashierJar,
    });
    assertEqual(response.status, 200, "detail status");
    const order = response.body.order as Record<string, unknown>;
    assertEqual((order.allowedNextStatuses as unknown[]).length, 0, "in-store order has no next statuses");
    assertEqual(order.placedByName, "Phase Five Cashier", "staff snapshot present");
  });
}

async function runStatusTests(managerJar: CookieJar, cashierJar: CookieJar): Promise<void> {
  console.log("\nOrders management - delivery workflow");

  await check("a cashier cannot change order status", async () => {
    const response = await api(
      `/api/pos/orders/${fixtures.onlineTransitionOrder}/status`,
      { method: "PATCH", jar: cashierJar, body: { newStatus: ORDER_STATUS.PREPARING } },
    );
    assertEqual(response.status, 403, "cashier PATCH rejected");
  });

  await check("a manager walks the order through the full delivery workflow", async () => {
    let status: string = ORDER_STATUS.PREPARING;
    for (const next of [
      ORDER_STATUS.PREPARING,
      ORDER_STATUS.ON_THE_WAY,
      ORDER_STATUS.DELIVERED,
    ]) {
      const response = await api(
        `/api/pos/orders/${fixtures.onlineTransitionOrder}/status`,
        { method: "PATCH", jar: managerJar, body: { newStatus: next } },
      );
      assertEqual(response.status, 200, `step to ${next} accepted`);
      assertEqual(
        (response.body.order as Record<string, unknown>).status,
        next,
        "status updated",
      );
      status = next;
    }
    assertEqual(status, ORDER_STATUS.DELIVERED, "workflow completed");
  });

  await check("the status changes write ORDER_STATUS_CHANGED audit entries", async () => {
    const entry = await AuditLog.findOne({
      action: AUDIT_ACTION.ORDER_STATUS_CHANGED,
      "metadata.orderNumber": fixtures.onlineTransitionOrder,
      "metadata.newStatus": ORDER_STATUS.DELIVERED,
    })
      .sort({ createdAt: -1 })
      .lean();
    assert(Boolean(entry), "audit entry exists");
    const metadata = entry?.metadata as Record<string, unknown>;
    assertEqual(metadata.previousStatus, ORDER_STATUS.ON_THE_WAY, "previous status recorded");
    assertEqual(metadata.channel, ORDER_CHANNEL.ONLINE, "channel recorded");
  });

  await check("illegal transitions are rejected with 409", async () => {
    const back = await api(
      `/api/pos/orders/${fixtures.onlineTransitionOrder}/status`,
      { method: "PATCH", jar: managerJar, body: { newStatus: ORDER_STATUS.ORDER_PLACED } },
    );
    assertEqual(back.status, 409, "backwards step -> 409");
    assertEqual(
      (back.body.error as { code?: string }).code,
      "INVALID_ORDER_TRANSITION",
      "error code",
    );

    const skip = await api(
      `/api/pos/orders/${fixtures.onlineTransitionOrder}/status`,
      { method: "PATCH", jar: managerJar, body: { newStatus: ORDER_STATUS.PREPARING } },
    );
    assertEqual(skip.status, 409, "skipping steps -> 409");
  });

  await check("a terminal order cannot move at all", async () => {
    const response = await api(
      `/api/pos/orders/${fixtures.onlineTransitionOrder}/status`,
      { method: "PATCH", jar: managerJar, body: { newStatus: ORDER_STATUS.ORDER_PLACED } },
    );
    assertEqual(response.status, 409, "terminal move -> 409");
  });

  await check("in-store sale status cannot be changed", async () => {
    const response = await api(
      `/api/pos/orders/${fixtures.inStoreOrder}/status`,
      { method: "PATCH", jar: managerJar, body: { newStatus: ORDER_STATUS.REFUNDED } },
    );
    assertEqual(response.status, 400, "in-store status change rejected");
    assertEqual(
      (response.body.error as { code?: string }).code,
      "INVALID_REQUEST",
      "error code",
    );
  });

  await check("an invalid status value in the body is rejected", async () => {
    const response = await api(
      `/api/pos/orders/${fixtures.onlineRefundOrder}/status`,
      { method: "PATCH", jar: managerJar, body: { newStatus: "TELEPORTED" } },
    );
    assertEqual(response.status, 400, "bogus status -> 400");
  });
}

async function runRefundTests(managerJar: CookieJar, cashierJar: CookieJar): Promise<void> {
  console.log("\nRefunds");

  await check("a cashier cannot issue refunds", async () => {
    const response = await api(
      `/api/pos/orders/${fixtures.onlineRefundOrder}/refund`,
      { method: "POST", jar: cashierJar, body: { reason: "Customer return" } },
    );
    assertEqual(response.status, 403, "cashier refund rejected");
  });

  await check("a refund without a reason is rejected", async () => {
    const response = await api(
      `/api/pos/orders/${fixtures.onlineRefundOrder}/refund`,
      { method: "POST", jar: managerJar, body: { reason: "x" } },
    );
    assertEqual(response.status, 400, "too-short reason -> 400");
  });

  await check("a manager refunds an online order and restores stock", async () => {
    const before = (await Product.findById(fixtures.productId).lean())?.stock ?? 0;
    const response = await api(
      `/api/pos/orders/${fixtures.onlineRefundOrder}/refund`,
      { method: "POST", jar: managerJar, body: { reason: "Customer return" } },
    );
    assertEqual(response.status, 200, "refund status");
    const order = response.body.order as Record<string, unknown>;
    assertEqual(order.status, ORDER_STATUS.REFUNDED, "order marked refunded");
    assertEqual(order.paymentStatus, PAYMENT_STATUS.REFUNDED, "payment marked refunded");
    assertEqual(order.refunded, true, "refunded flag");
    assertEqual(order.refundable, false, "no further refunds possible");
    assert(order.refundedTotalInPaise === 2 * 12900, "refunded total matches order total");

    const refund = (order.refunds as Array<Record<string, unknown>>)[0];
    assert(Boolean(refund), "refund record appended");
    assertEqual(refund.status, REFUND_STATUS.COMPLETED, "refund completes immediately");
    assertEqual(refund.reason, "Customer return", "reason stored");
    assertEqual(refund.amountInPaise, 2 * 12900, "full amount refunded");

    const after = (await Product.findById(fixtures.productId).lean())?.stock ?? 0;
    assertEqual(after, before + 2, "physical stock restored by the order quantity");

    const restored = (response.body.restoredItems as Array<Record<string, unknown>>) ?? [];
    assertEqual(restored.length, 1, "restock line reported");
    assertEqual(restored[0].quantity, 2, "restored quantity");
  });

  await check("a second refund is impossible (no double restock)", async () => {
    const before = (await Product.findById(fixtures.productId).lean())?.stock ?? 0;
    const response = await api(
      `/api/pos/orders/${fixtures.onlineRefundOrder}/refund`,
      { method: "POST", jar: managerJar, body: { reason: "Try again" } },
    );
    assertEqual(response.status, 409, "double refund rejected");
    assertEqual((response.body.error as { code?: string }).code, "ALREADY_REFUNDED", "error code");
    const after = (await Product.findById(fixtures.productId).lean())?.stock ?? 0;
    assertEqual(after, before, "stock not restored twice");
  });

  await check("the refund writes an ORDER_REFUNDED audit entry", async () => {
    const entry = await AuditLog.findOne({
      action: AUDIT_ACTION.ORDER_REFUNDED,
      "metadata.orderNumber": fixtures.onlineRefundOrder,
    })
      .sort({ createdAt: -1 })
      .lean();
    assert(Boolean(entry), "audit entry exists");
    const metadata = entry?.metadata as Record<string, unknown>;
    assertEqual(metadata.amountInPaise, 2 * 12900, "refund amount in metadata");
    assertEqual(metadata.reason, "Customer return", "reason in metadata");
  });

  await check("an in-store sale can also be refunded", async () => {
    const response = await api(
      `/api/pos/orders/${fixtures.inStoreOrder}/refund`,
      { method: "POST", jar: managerJar, body: { reason: "Wrong order" } },
    );
    assertEqual(response.status, 200, "refund status");
    const order = response.body.order as Record<string, unknown>;
    assertEqual(order.status, ORDER_STATUS.REFUNDED, "store order marked refunded");
    assertEqual(order.paymentStatus, PAYMENT_STATUS.REFUNDED, "payment marked refunded");
  });

  await check("missing catalogue products do not block the refund", async () => {
    const response = await api(
      `/api/pos/orders/${fixtures.onlineMissingProductOrder}/refund`,
      { method: "POST", jar: managerJar, body: { reason: "Damaged item" } },
    );
    assertEqual(response.status, 200, "refund still succeeds");
    const order = response.body.order as Record<string, unknown>;
    assertEqual(order.status, ORDER_STATUS.REFUNDED, "order marked refunded");
    const missing = (response.body.missingProducts as Array<Record<string, unknown>>) ?? [];
    assertEqual(missing.length, 1, "missing product reported, not fabricated");
    assertEqual(missing[0].productId, fixtures.missingProductId, "missing product id");
  });
}

async function runReportTests(
  managerJar: CookieJar,
  cashierJar: CookieJar,
  baseline: ReportBaseline,
): Promise<void> {
  console.log("\nReports");

  await check("anonymous callers cannot read reports", async () => {
    const response = await api("/api/pos/reports");
    assertEqual(response.status, 401, "anonymous GET rejected");
  });

  await check("cashiers cannot read reports", async () => {
    const response = await api("/api/pos/reports", { jar: cashierJar });
    assertEqual(response.status, 403, "cashier GET rejected");
  });

  await check("a manager reads live aggregated metrics", async () => {
    const response = await api("/api/pos/reports", { jar: managerJar });
    assertEqual(response.status, 200, "reports status");
    const report = response.body.report as Record<string, unknown>;
    const channel = report.channelBreakdown as Record<string, unknown>;
    const inStore = channel.inStore as Record<string, unknown>;
    const online = channel.online as Record<string, unknown>;

    assert(typeof report.generatedAt === "string", "generatedAt present");
    assertEqual(typeof report.timezone, "string", "business timezone reported");
    assertEqual((report.last7Days as unknown[]).length, 7, "exactly 7 days in the window");
    assert(typeof report.todayRevenueInPaise === "number", "today revenue aggregated");
    assert(((report.ordersToday as number) ?? 0) >= 4, "orders today counts every fixture order");
    assertEqual(
      online.orderCount,
      baseline.onlineOrderCount + 1,
      "the delivered ONLINE fixture is the only qualifying ONLINE addition",
    );
    assertEqual(
      online.revenueInPaise,
      baseline.onlineRevenueInPaise + 12900,
      "ONLINE revenue grows by the delivered order",
    );
    assertEqual(
      inStore.orderCount,
      baseline.inStoreOrderCount,
      "refunded in-store order excluded from channel revenue",
    );
    assertEqual(
      channel.refundedCount,
      baseline.refundedCount + 3,
      "refunded orders (online refund, in-store, missing-product) counted separately",
    );
    assertEqual(
      report.totalRevenueInPaise,
      baseline.totalRevenueInPaise + 12900,
      "total revenue grows only by the qualifying delivered online order",
    );
    assertEqual(
      report.totalOrderCount,
      baseline.totalOrderCount + 1,
      "single qualifying order added",
    );
    assertEqual(
      report.averageOrderValueInPaise,
      Math.floor((report.totalRevenueInPaise as number) / (report.totalOrderCount as number)),
      "average order value derived",
    );
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
    await insertStaff({ name: "Phase Five Manager", email: managerEmail, role: "MANAGER" });
    const managerJar = await fullSignIn(managerEmail, true);

    const cashierEmail = uniqueEmail();
    const cashierId = await insertStaff({ name: "Phase Five Cashier", email: cashierEmail, role: "CASHIER" });
    const cashierJar = await fullSignIn(cashierEmail, false);

    // Reports read the whole collection; capture the pre-existing baseline
    // before any fixture orders exist so the assertions below are deterministic.
    const baseline = await readReportBaseline(managerJar);

    const categoryId = await createCategory();
    const productName = `Phase Five Latte ${unique("prd")}`;
    const productId = await createProduct({
      name: productName,
      sku: `P5-${token(8)}`,
      priceInPaise: 12900,
      stock: 5,
      category: categoryId,
    });
    const missingProductId = await createProduct({
      name: `Phase Five Phantom ${unique("ph")}`,
      sku: `P5P-${token(8)}`,
      priceInPaise: 7000,
      stock: 2,
      category: categoryId,
    });

    // The refund target (2x latte).
    fixtures.onlineRefundOrder = await createOnlineOrder({
      items: [{ productId, productName, sku: `P5-${token(8)}`, quantity: 2, unitPriceInPaise: 12900 }],
    });
    // The status-workflow target (1x latte, stays ORDER_PLACED at first).
    fixtures.onlineTransitionOrder = await createOnlineOrder({
      items: [{ productId, productName, sku: `P5-${token(8)}`, quantity: 1, unitPriceInPaise: 12900 }],
    });
    // The missing-product refund target.
    fixtures.onlineMissingProductOrder = await createOnlineOrder({
      items: [
        { productId, productName, sku: `P5-${token(8)}`, quantity: 1, unitPriceInPaise: 12900 },
        {
          productId: missingProductId,
          productName: `Phantom ${token(6)}`,
          sku: `P5P-${token(8)}`,
          quantity: 1,
          unitPriceInPaise: 7000,
        },
      ],
    });
    // The in-store sale (1x latte), as if rung up on the register.
    fixtures.inStoreOrder = await createInStoreOrder({
      productId,
      productName,
      sku: `P5-${token(8)}`,
      quantity: 1,
      unitPriceInPaise: 12900,
      staffId: cashierId,
      staffName: "Phase Five Cashier",
    });

    fixtures.productId = productId;
    fixtures.missingProductId = missingProductId;
    fixtures.categoryId = categoryId;
    fixtures.staffId = cashierId;

    // Remove the phantom product so the refund hits a missing-product path.
    await Product.deleteOne({ _id: missingProductId });

    await runOrdersListTests(cashierJar);
    await runStatusTests(managerJar, cashierJar);
    await runRefundTests(managerJar, cashierJar);
    await runReportTests(managerJar, cashierJar, baseline);
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
