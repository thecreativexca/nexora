/**
 * API + MongoDB integration tests.
 *
 * Requires:
 *   - a seeded development database (npm run seed)
 *   - the dev server running (npm run dev)
 *
 * Run with: npm run test:api
 *
 * The suite exercises the real HTTP endpoints and then inspects MongoDB to
 * prove prices, stock movements and item snapshots are correct. Test orders are
 * removed and product stock is restored at the end.
 */
import { connectDB, disconnectDB } from "@/lib/db/mongodb";
import { Order } from "@/models/Order";
import { Product } from "@/models/Product";
import { loadEnvFiles } from "@/scripts/load-env";

const BASE_URL = process.env.NEXORA_TEST_BASE_URL ?? "http://localhost:3000";

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

async function fetchText(path: string): Promise<{ status: number; body: string }> {
  const response = await fetch(`${BASE_URL}${path}`, { redirect: "manual" });
  return { status: response.status, body: await response.text() };
}

async function fetchJson(
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await response.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    parsed = { raw: text };
  }
  return { status: response.status, body: parsed };
}

function customer(email: string) {
  return {
    customerName: "Integration Tester",
    customerEmail: email,
    customerPhone: "+91 90000 00000",
    address: {
      line1: "42 Test Street",
      line2: "Near the service centre",
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
      country: "India",
    },
    notes: "Created by the automated Phase 1 test suite.",
  };
}

function assertTrue(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function assertFalse(condition: boolean, message: string): void {
  if (condition) throw new Error(message);
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

async function describeProducts(): Promise<{
  iphone: string;
  vivo: string;
  oppo: string;
  service: string;
  inactive: string;
  laptopWith4K: string;
  yoga: string;
  macbook: string;
  huawei: string;
}> {
  const [iphone, vivo, oppo, service, inactive, laptopWith4K, yoga, macbook, huawei] =
    await Promise.all([
      Product.findOne({ slug: "apple-iphone-13-pro-128gb" }).lean(),
      Product.findOne({ slug: "vivo-s1-6gb-128gb" }).lean(),
      Product.findOne({ slug: "oppo-f19-pro-plus-5g-128gb" }).lean(),
      Product.findOne({ slug: "nexora-extended-warranty-2-years" }).lean(),
      Product.findOne({ slug: "nexora-smart-plug-gen-3" }).lean(),
      Product.findOne({ slug: "asus-zenbook-pro-duo-15" }).lean(),
      Product.findOne({ slug: "lenovo-yoga-920" }).lean(),
      Product.findOne({ slug: "apple-macbook-pro-14-m3-space-grey" }).lean(),
      Product.findOne({ slug: "huawei-matebook-x-pro" }).lean(),
    ]);

  if (
    !iphone ||
    !vivo ||
    !oppo ||
    !service ||
    !inactive ||
    !laptopWith4K ||
    !yoga ||
    !macbook ||
    !huawei
  ) {
    throw new Error(
      "Seeded catalogue is incomplete. Run `npm run seed` before running the API tests.",
    );
  }

  return {
    iphone: String(iphone._id),
    vivo: String(vivo._id),
    oppo: String(oppo._id),
    service: String(service._id),
    inactive: String(inactive._id),
    laptopWith4K: String(laptopWith4K._id),
    yoga: String(yoga._id),
    macbook: String(macbook._id),
    huawei: String(huawei._id),
  };
}

const TEST_EMAIL = "integration-test@nexora.example";
const latestStocks = new Map<string, number>();

async function readStocks(ids: string[]): Promise<Map<string, number>> {
  const docs = await Product.find({ _id: { $in: ids } }).select("stock").lean<{ _id: unknown; stock: number }[]>();
  return new Map(docs.map((doc) => [String(doc._id), doc.stock]));
}

async function refreshLatestStocks(ids: string[]): Promise<void> {
  latestStocks.clear();
  for (const [id, stock] of await readStocks(ids)) latestStocks.set(id, stock);
}

function stocksAt(productId: string): number {
  return latestStocks.get(productId) ?? 0;
}

async function main(): Promise<void> {
  loadEnvFiles();
  await connectDB();

  const products = await describeProducts();
  const iPhonePrice = (await Product.findById(products.iphone).select("priceInPaise"))!.priceInPaise;
  const macbookPrice = (await Product.findById(products.macbook).select("priceInPaise"))!.priceInPaise;
  const warrantyPrice = (await Product.findById(products.service).select("priceInPaise"))!.priceInPaise;

  const stocksBefore = await readStocks([products.iphone, products.vivo, products.macbook, products.service, products.oppo]);

  try {
    await runCatalogTests();
    await runCartTests(products, iPhonePrice);
    await runOrderTests(products, iPhonePrice, macbookPrice, warrantyPrice);
  } finally {
    await cleanup(stocksBefore);
    await disconnectDB();
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.error(`Failed checks:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
}

async function runCatalogTests(): Promise<void> {
  console.log("\nCatalog API");

  await check("health endpoint reports a connected database", async () => {
    const { status, body } = await fetchJson("/api/health");
    assertEqual(status, 200, "health status");
    assertEqual((body.database as { connected?: boolean } | undefined)?.connected, true, "database.connected");
  });

  await check("homepage renders seeded products from MongoDB", async () => {
    const { status, body } = await fetchText("/");
    assertEqual(status, 200, "homepage status");
    assert(countOccurrences(body, "iPhone 13 Pro") > 0, "homepage should mention the seeded iPhone");
  });

  await check("inactive products never appear in the public catalogue", async () => {
    const { body } = await fetchJson("/api/products?pageSize=48");
    const slugs = (body.products as { slug: string }[]).map((product) => product.slug);
    assertFalse(slugs.includes("nexora-smart-plug-gen-3"), "inactive smart plug must not be public");
    assertFalse(slugs.includes("nexora-indoor-security-camera-2k"), "inactive camera must not be public");
    assertTrue((body.total as number) > 0, "catalogue should not be empty");
  });

  await check("inactive product detail page returns not found", async () => {
    const { status } = await fetchText("/products/nexora-smart-plug-gen-3");
    assertEqual(status, 404, "inactive product page status");
  });

  await check("search finds products by name", async () => {
    const { body } = await fetchJson("/api/products?q=iphone");
    const slugs = (body.products as { slug: string }[]).map((product) => product.slug);
    assertTrue(slugs.includes("apple-iphone-13-pro-128gb"), "search should find the iPhone");
  });

  await check("category filtering works", async () => {
    const { body } = await fetchJson("/api/products?category=laptops&pageSize=48");
    const found = body.products as { categorySlug: string }[];
    assertTrue(found.length > 0, "laptops category should have products");
    assertTrue(found.every((product) => product.categorySlug === "laptops"), "all results must be laptops");
    assertEqual(body.total, found.length, "total matches page contents");
  });

  await check("search and category filter combine", async () => {
    const laptopOnly = await fetchJson("/api/products?q=macbook&category=laptops");
    assertTrue(((laptopOnly.body.total as number) ?? 0) >= 1, "macbook should match in laptops");
    const wrongCategory = await fetchJson("/api/products?q=macbook&category=cellphones");
    assertEqual(wrongCategory.body.total, 0, "macbook must not match in cellphones");
  });

  await check("case-insensitive search works", async () => {
    const { body } = await fetchJson("/api/products?q=IPHONE");
    assertTrue(((body.total as number) ?? 0) >= 1, "uppercase search should still match");
  });

  await check("regex metacharacters in search are escaped, not executed", async () => {
    const { status, body } = await fetchJson("/api/products?q=" + encodeURIComponent("(.*["));
    assertEqual(status, 200, "hostile search must not 500");
    assertEqual(body.total, 0, "hostile search should not match anything");
  });

  await check("invalid category slug yields an empty result", async () => {
    const { body } = await fetchJson("/api/products?category=does-not-exist");
    assertEqual(body.total, 0, "unknown category should return zero products");
  });

  await check("category with no active products yields an empty result", async () => {
    const { body } = await fetchJson("/api/products?category=smart-home");
    assertEqual(body.total, 0, "smart-home has no active products");
  });

  await check("out-of-stock product is listed but flagged by stock", async () => {
    const { body } = await fetchJson("/api/products?q=" + encodeURIComponent("Oppo F19"));
    const oppo = (body.products as { slug: string; stock: number }[]).find(
      (p) => p.slug === "oppo-f19-pro-plus-5g-128gb",
    );
    assertTrue(Boolean(oppo), "out-of-stock product should still be browsable");
    assertEqual(oppo?.stock, 0, "out-of-stock product reports stock 0");
  });
}


async function runCartTests(products: Awaited<ReturnType<typeof describeProducts>>, iPhonePrice: number): Promise<void> {
  console.log("\nCart validation API");

  await check("cart validate re-prices lines from MongoDB", async () => {
    const { status, body } = await fetchJson("/api/cart/validate", {
      method: "POST",
      body: JSON.stringify({
        lines: [
          { productId: products.iphone, quantity: 2, unitPriceInPaise: 1, name: "tampered" },
          { productId: products.service, quantity: 1 },
        ],
      }),
    });
    assertEqual(status, 200, "status");
    const lines = body.lines as { productId: string; unitPriceInPaise: number; status: string; lineTotalInPaise: number }[];
    const iphone = lines.find((line) => line.productId === products.iphone)!;
    const service = lines.find((line) => line.productId === products.service)!;
    assertEqual(iphone.unitPriceInPaise, iPhonePrice, "tampered client price replaced by DB price");
    assertEqual(iphone.lineTotalInPaise, iPhonePrice * 2, "line total uses the DB price");
    assertEqual(iphone.status, "OK", "iPhone line is available");
    assertEqual(service.status, "OK", "service line is available despite stock 0");
    assertEqual(body.hasIssues, false, "no issues expected");
  });

  await check("cart validate flags inactive, out-of-stock and over-ordered lines", async () => {
    await refreshLatestStocks([products.iphone]);
    const { status, body } = await fetchJson("/api/cart/validate", {
      method: "POST",
      body: JSON.stringify({
        lines: [
          { productId: products.inactive, quantity: 1 },
          { productId: products.oppo, quantity: 1 },
          { productId: products.iphone, quantity: 99 },
        ],
      }),
    });
    assertEqual(status, 200, "status");
    const byProduct = new Map(
      (body.lines as { productId: string; status: string; available: boolean; maxQuantity: number | null }[]).map(
        (line) => [line.productId, line],
      ),
    );
    assertEqual(byProduct.get(products.inactive)!.status, "INACTIVE", "inactive product flagged");
    assertEqual(byProduct.get(products.oppo)!.status, "OUT_OF_STOCK", "out-of-stock product flagged");
    const overOrder = byProduct.get(products.iphone)!;
    assertEqual(overOrder.status, "INSUFFICIENT_STOCK", "over-order flagged");
    assertEqual(overOrder.maxQuantity, stocksAt(products.iphone), "max quantity reflects real stock");
    assertEqual(body.hasIssues, true, "issues reported");
  });

  await check("cart validate rejects invalid input", async () => {
    const invalidId = await fetchJson("/api/cart/validate", {
      method: "POST",
      body: JSON.stringify({ lines: [{ productId: "not-an-objectid", quantity: 2 }] }),
    });
    assertEqual(invalidId.status, 400, "bad ObjectId rejected");
    const negativeQty = await fetchJson("/api/cart/validate", {
      method: "POST",
      body: JSON.stringify({ lines: [{ productId: products.iphone, quantity: -1 }] }),
    });
    assertEqual(negativeQty.status, 400, "negative quantity rejected");
    const decimalQty = await fetchJson("/api/cart/validate", {
      method: "POST",
      body: JSON.stringify({ lines: [{ productId: products.iphone, quantity: 1.5 }] }),
    });
    assertEqual(decimalQty.status, 400, "decimal quantity rejected");
  });
}


async function runOrderTests(
  products: Awaited<ReturnType<typeof describeProducts>>,
  iPhonePrice: number,
  macbookPrice: number,
  warrantyPrice: number,
): Promise<void> {
  console.log("\nOrder API");

  await refreshLatestStocks([products.iphone, products.macbook, products.service]);

  await check("checkout rejects invalid customer details", async () => {
    const { status, body } = await fetchJson("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        ...customer("not-an-email"),
        customerPhone: "123",
        items: [{ productId: products.iphone, quantity: 1 }],
      }),
    });
    assertEqual(status, 400, "validation failure status");
    const fieldErrors = (body.error as { fieldErrors?: Record<string, string[]> }).fieldErrors ?? {};
    assertTrue(Array.isArray(fieldErrors.customerEmail), "email error reported");
    assertTrue(Array.isArray(fieldErrors.customerPhone), "phone error reported");
  });

  await check("checkout rejects an empty bag", async () => {
    const { status } = await fetchJson("/api/orders", {
      method: "POST",
      body: JSON.stringify({ ...customer(TEST_EMAIL), items: [] }),
    });
    assertEqual(status, 400, "empty bag rejected");
  });

  let placedOrderNumber = "";

  await check("valid order is created with server-side prices, ignoring tampered totals", async () => {
    const { status, body } = await fetchJson("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        ...customer(TEST_EMAIL),
        // Tampered client-side money fields: must be ignored entirely.
        unitPriceInPaise: 1,
        subtotalInPaise: 1,
        totalInPaise: 1,
        items: [
          { productId: products.iphone, quantity: 2, unitPriceInPaise: 1 },
          { productId: products.macbook, quantity: 1 },
          { productId: products.service, quantity: 1 },
        ],
      }),
    });
    assertEqual(status, 201, "order created");
    const order = body.order as { orderNumber: string; totalInPaise: number; itemCount: number; status: string };
    placedOrderNumber = order.orderNumber;
    assertTrue(/^NX-\d{8}-[A-Z0-9]{6}$/.test(order.orderNumber), `order number format (${order.orderNumber})`);
    assertEqual(order.totalInPaise, iPhonePrice * 2 + macbookPrice + warrantyPrice, "server-calculated total");
    assertEqual(order.itemCount, 4, "item count");
    assertEqual(order.status, "ORDER_PLACED", "initial status");
  });

  await check("order is persisted with snapshots, payment defaults and stock movements", async () => {
    const order = await Order.findOne({ orderNumber: placedOrderNumber })
      .lean<{ items: { productId: unknown; productName: string; sku: string; quantity: number; unitPriceInPaise: number; isService: boolean }[]; channel: string; status: string; paymentMethod: string; paymentStatus: string; subtotalInPaise: number; totalInPaise: number } | null>();
    assertTrue(Boolean(order), "order exists in MongoDB");
    assertEqual(order!.channel, "ONLINE", "channel");
    assertEqual(order!.status, "ORDER_PLACED", "status");
    assertEqual(order!.paymentMethod, "PAYPAL", "payment method");
    assertEqual(order!.paymentStatus, "PAID", "payment status");
    assertEqual(order!.items.length, 3, "snapshot lines");
    const iphoneSnapshot = order!.items.find((item) => String(item.productId) === products.iphone)!;
    assertEqual(iphoneSnapshot.unitPriceInPaise, iPhonePrice, "snapshot price from DB");
    assertEqual(iphoneSnapshot.isService, false, "physical snapshot flag");
    assert(iphoneSnapshot.productName.length > 0 && iphoneSnapshot.sku.length > 0, "snapshot stores name + sku");
    const serviceSnapshot = order!.items.find((item) => String(item.productId) === products.service)!;
    assertEqual(serviceSnapshot.isService, true, "service snapshot flag");
    assertEqual(order!.subtotalInPaise, order!.totalInPaise, "subtotal equals total in Phase 1");

    const stocks = await readStocks([products.iphone, products.macbook, products.service]);
    assertEqual(stocks.get(products.iphone)!, latestStocks.get(products.iphone)! - 2, "physical stock decremented");
    assertEqual(stocks.get(products.macbook)!, latestStocks.get(products.macbook)! - 1, "macbook stock decremented");
    assertEqual(stocks.get(products.service)!, latestStocks.get(products.service)!, "service stock untouched");
    await refreshLatestStocks([products.iphone, products.macbook, products.service]);
  });

  await check("order confirmation page renders the placed order", async () => {
    const { status, body } = await fetchText(`/order/${placedOrderNumber}`);
    assertEqual(status, 200, "confirmation status");
    assert(body.includes(placedOrderNumber), "page shows the order number");
    assertFalse(/not found/i.test(body), "page must not show the not-found state");
    assert(!body.includes("24 bytes"), "no raw ObjectIds leaked");
  });

  await check("invalid order number renders not found", async () => {
    const { status, body } = await fetchText("/order/NX-20990101-ZZZZZZ");
    assertEqual(status, 404, "unknown order status");
    assertTrue(/could not|no longer|not found/i.test(body), "friendly not-found copy shown");
  });

  await check("insufficient stock prevents checkout", async () => {
    const { status, body } = await fetchJson("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        ...customer(TEST_EMAIL),
        items: [{ productId: products.iphone, quantity: Math.min(stocksAt(products.iphone) + 1, 99) }],
      }),
    });
    assertEqual(status, 409, "conflict status");
    assertEqual((body.error as { code: string }).code, "OUT_OF_STOCK", "error code");
  });

  await check("out-of-stock product prevents checkout", async () => {
    const { status, body } = await fetchJson("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        ...customer(TEST_EMAIL),
        items: [{ productId: products.oppo, quantity: 1 }],
      }),
    });
    assertEqual(status, 409, "conflict status");
    assertEqual((body.error as { code: string }).code, "OUT_OF_STOCK", "error code");
  });

  await check("inactive product prevents checkout", async () => {
    const { status, body } = await fetchJson("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        ...customer(TEST_EMAIL),
        items: [{ productId: products.inactive, quantity: 1 }],
      }),
    });
    assertEqual(status, 409, "conflict status");
    assertEqual((body.error as { code: string }).code, "PRODUCT_UNAVAILABLE", "error code");
  });

  await check("failed checkout leaves no partial order and no stock movement", async () => {
    const stocksBeforeAttempt = await readStocks([products.iphone, products.oppo]);
    const ordersBeforeAttempt = await Order.countDocuments({ customerEmail: TEST_EMAIL });

    const { status } = await fetchJson("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        ...customer(TEST_EMAIL),
        // First line is fine, second cannot be fulfilled -> whole transaction must roll back.
        items: [
          { productId: products.iphone, quantity: 1 },
          { productId: products.oppo, quantity: 1 },
        ],
      }),
    });
    assertEqual(status, 409, "attempt rejected");

    const stocksAfterAttempt = await readStocks([products.iphone, products.oppo]);
    assertEqual(stocksAfterAttempt.get(products.iphone)!, stocksBeforeAttempt.get(products.iphone)!, "iPhone stock rolled back");
    assertEqual(stocksAfterAttempt.get(products.oppo)!, stocksBeforeAttempt.get(products.oppo)!, "Oppo stock unchanged");
    const ordersAfterAttempt = await Order.countDocuments({ customerEmail: TEST_EMAIL });
    assertEqual(ordersAfterAttempt, ordersBeforeAttempt, "no partial order persisted");
  });

  await check("duplicate lines for the same product are merged and priced once", async () => {
    const { status, body } = await fetchJson("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        ...customer(TEST_EMAIL),
        items: [
          { productId: products.vivo, quantity: 1 },
          { productId: products.vivo, quantity: 2 },
        ],
      }),
    });
    assertEqual(status, 201, "merged order created");
    const order = body.order as { orderNumber: string; itemCount: number };
    assertEqual(order.itemCount, 3, "quantities merged");
    const persisted = await Order.findOne({ orderNumber: order.orderNumber }).lean<{ items: { quantity: number }[] } | null>();
    assertEqual(persisted!.items.length, 1, "one snapshot line");
    assertEqual(persisted!.items[0].quantity, 3, "snapshot quantity merged");
  });


}


async function cleanup(stocksBefore: Map<string, number>): Promise<void> {
  try {
    for (const [id, stock] of stocksBefore) {
      await Product.updateOne({ _id: id }, { $set: { stock } });
    }
    const ordersDeleted = await Order.deleteMany({ customerEmail: TEST_EMAIL });
    if (ordersDeleted.deletedCount > 0) {
      console.log(`[cleanup] restored stock and removed ${ordersDeleted.deletedCount} test order(s)`);
    }
  } catch (error) {
    console.error("[cleanup] failed", error);
  }
}

main().catch(async (error: unknown) => {
  console.error(error);
  await disconnectDB().catch(() => undefined);
  process.exit(1);
});


