/**
 * Customer account + order-history integration tests.
 *
 * Requires:
 *   - a seeded development database (npm run seed)
 *   - the dev server running (npm run dev)
 *
 * Run with: npm run test:account
 *
 * Covers the Phase 2 contract end to end over real HTTP: registration, login,
 * session cookies, profile updates, logout, authenticated checkout, order
 * history, and (most importantly) that one customer can never read another
 * customer's order. Only SERVICE products are ordered, so no stock is moved.
 */
import type { Types } from "mongoose";

import { connectDB, disconnectDB } from "@/lib/db/mongodb";
import { CUSTOMER_SESSION_COOKIE } from "@/lib/constants/customer";
import { Customer } from "@/models/Customer";
import { CustomerSession } from "@/models/CustomerSession";
import { Order } from "@/models/Order";
import { Product } from "@/models/Product";
import { loadEnvFiles } from "@/scripts/load-env";

const BASE_URL = process.env.NEXORA_TEST_BASE_URL ?? "http://localhost:3000";

let passed = 0;
const failures: string[] = [];
const createdEmails: string[] = [];

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

interface JsonResponse {
  status: number;
  body: Record<string, unknown>;
  cookie: string;
}

async function fetchJson(
  path: string,
  init?: RequestInit & { cookie?: string },
): Promise<JsonResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init?.headers as Record<string, string> | undefined) ?? {}),
  };
  if (init?.cookie) headers.Cookie = `${CUSTOMER_SESSION_COOKIE}=${init.cookie}`;

  const response = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  const text = await response.text();

  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    parsed = { raw: text };
  }

  return { status: response.status, body: parsed, cookie: readSessionCookie(response) };
}

function readSessionCookie(response: Response): string {
  const setCookies =
    typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  for (const cookie of setCookies) {
    const match = cookie.match(new RegExp(`${CUSTOMER_SESSION_COOKIE}=([^;]+)`));
    if (match) return match[1];
  }
  return "";
}

function uniqueEmail(label: string): string {
  const email = `acct-${label}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@nexora.example`;
  createdEmails.push(email);
  return email;
}

const PASSWORD = "Secret@12345";

function registration(email: string, overrides: Record<string, unknown> = {}) {
  return {
    name: "Account Tester",
    email,
    password: PASSWORD,
    confirmPassword: PASSWORD,
    phone: "9876500000",
    ...overrides,
  };
}

async function register(email: string): Promise<{ cookie: string; customerId: string }> {
  const { status, body, cookie } = await fetchJson("/api/account/register", {
    method: "POST",
    body: JSON.stringify(registration(email)),
  });
  assertEqual(status, 201, "registration status");
  const customer = body.customer as { id: string; email: string } | undefined;
  assert(Boolean(customer?.id), "registration returns the created customer");
  assert(Boolean(cookie), "registration sets a session cookie");
  return { cookie, customerId: customer!.id };
}

async function main(): Promise<void> {
  loadEnvFiles();
  await connectDB();

  const serviceProduct = await Product.findOne({ sku: "NX-SVC-SETUP-DATA" }).lean();
  if (!serviceProduct) {
    throw new Error("Seeded catalogue is incomplete. Run `npm run seed` before running these tests.");
  }
  const serviceId = String(serviceProduct._id);

  try {
    await runAuthTests();
    await runOrderAndIdorTests(serviceId);
    await runPageRedirectTests();
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

async function runAuthTests(): Promise<void> {
  console.log("\nCustomer auth API");

  const email = uniqueEmail("primary");

  await check("registration rejects a mismatched confirmation password", async () => {
    const { status, body } = await fetchJson("/api/account/register", {
      method: "POST",
      body: JSON.stringify(registration(uniqueEmail("bad"), { confirmPassword: "Something@999" })),
    });
    assertEqual(status, 400, "validation status");
    const fieldErrors = (body.error as { fieldErrors?: Record<string, string[]> }).fieldErrors ?? {};
    assert(Boolean(fieldErrors.confirmPassword), "confirmPassword error reported");
  });

  await check("registration creates an account and signs it in", async () => {
    const { status, body, cookie } = await fetchJson("/api/account/register", {
      method: "POST",
      body: JSON.stringify(registration(email)),
    });
    assertEqual(status, 201, "registration status");
    assert(Boolean(cookie), "session cookie issued");
    const customer = body.customer as { email: string; passwordHash?: string };
    assertEqual(customer.email, email, "email normalised to lower case");
    assert(!("passwordHash" in customer), "passwordHash is never returned");
  });

  await check("duplicate email is rejected with EMAIL_TAKEN", async () => {
    const { status, body } = await fetchJson("/api/account/register", {
      method: "POST",
      body: JSON.stringify(registration(email)),
    });
    assertEqual(status, 409, "duplicate status");
    assertEqual((body.error as { code: string }).code, "EMAIL_TAKEN", "error code");
  });

  await check("login with a wrong password fails generically", async () => {
    const { status, body } = await fetchJson("/api/account/login", {
      method: "POST",
      body: JSON.stringify({ email, password: "wrong-password" }),
    });
    assertEqual(status, 401, "status");
    const error = body.error as { code: string; message: string };
    assertEqual(error.code, "INVALID_CREDENTIALS", "error code");
    assertEqual(error.message, "Invalid email or password.", "generic message");
  });

  await check("login with an unknown email fails identically", async () => {
    const { status, body } = await fetchJson("/api/account/login", {
      method: "POST",
      body: JSON.stringify({ email: `nobody-${Date.now()}@nexora.example`, password: PASSWORD }),
    });
    assertEqual(status, 401, "status");
    assertEqual(
      (body.error as { message: string }).message,
      "Invalid email or password.",
      "no account enumeration",
    );
  });

  let loginCookie = "";

  await check("login with correct credentials issues a session", async () => {
    const { status, cookie } = await fetchJson("/api/account/login", {
      method: "POST",
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    assertEqual(status, 200, "status");
    assert(Boolean(cookie), "cookie issued");
    loginCookie = cookie;
  });

  await check("/api/account/me requires a session", async () => {
    const { status, body } = await fetchJson("/api/account/me");
    assertEqual(status, 401, "status");
    assertEqual((body.error as { code: string }).code, "UNAUTHENTICATED", "error code");
  });

  await check("/api/account/me returns the signed-in customer without secrets", async () => {
    const { status, body } = await fetchJson("/api/account/me", { cookie: loginCookie });
    assertEqual(status, 200, "status");
    const customer = body.customer as Record<string, unknown>;
    assertEqual(customer.email, email, "returns the correct customer");
    assert(!("passwordHash" in customer), "no password hash leaked");
  });

  await check("profile update saves name, phone and address", async () => {
    const { status, body } = await fetchJson("/api/account/me", {
      method: "PATCH",
      cookie: loginCookie,
      body: JSON.stringify({
        name: "Updated Name",
        phone: "9123456780",
        address: {
          line1: "1 New Street",
          line2: "",
          city: "Pune",
          state: "Maharashtra",
          postalCode: "411001",
          country: "India",
        },
      }),
    });
    assertEqual(status, 200, "status");
    const customer = body.customer as { name: string; address: { city: string } | null };
    assertEqual(customer.name, "Updated Name", "name saved");
    assertEqual(customer.address?.city, "Pune", "address saved");
  });

  await check("logout revokes the session server-side", async () => {
    const { status } = await fetchJson("/api/account/logout", {
      method: "POST",
      cookie: loginCookie,
    });
    assertEqual(status, 200, "logout status");

    const after = await fetchJson("/api/account/me", { cookie: loginCookie });
    assertEqual(after.status, 401, "revoked cookie is rejected");
  });
}

async function runOrderAndIdorTests(serviceId: string): Promise<void> {
  console.log("\nAuthenticated orders + access control");

  const ownerEmail = uniqueEmail("owner");
  const otherEmail = uniqueEmail("other");

  const owner = await register(ownerEmail);
  const other = await register(otherEmail);

  let orderNumber = "";

  await check("a signed-in customer's order is linked to their account", async () => {
    const { status, body } = await fetchJson("/api/orders", {
      method: "POST",
      cookie: owner.cookie,
      body: JSON.stringify({
        customerName: "Account Tester",
        customerEmail: ownerEmail,
        customerPhone: "9876500000",
        address: {
          line1: "42 Test Street",
          line2: "",
          city: "Bengaluru",
          state: "Karnataka",
          postalCode: "560001",
          country: "India",
        },
        notes: "",
        items: [{ productId: serviceId, quantity: 1 }],
      }),
    });
    assertEqual(status, 201, "order status");
    orderNumber = (body.order as { orderNumber: string }).orderNumber;
  });

  await check("the order is scoped to the owner in MongoDB", async () => {
    const order = await Order.findOne({ orderNumber }).lean<{ customerId: unknown } | null>();
    assert(Boolean(order), "order persisted");
    assertEqual(String(order!.customerId), owner.customerId, "customerId matches the session owner");
  });

  await check("the owner sees the order in their history", async () => {
    const { status, body } = await fetchJson("/api/account/orders", { cookie: owner.cookie });
    assertEqual(status, 200, "status");
    const numbers = (body.orders as { orderNumber: string }[]).map((order) => order.orderNumber);
    assert(numbers.includes(orderNumber), "owner's order appears in the list");
  });

  await check("the owner can open the order detail", async () => {
    const { status, body } = await fetchJson(`/api/account/orders/${orderNumber}`, {
      cookie: owner.cookie,
    });
    assertEqual(status, 200, "status");
    assertEqual(
      (body.order as { orderNumber: string }).orderNumber,
      orderNumber,
      "returns the requested order",
    );
  });

  await check("another customer cannot read the order (IDOR blocked)", async () => {
    const { status } = await fetchJson(`/api/account/orders/${orderNumber}`, {
      cookie: other.cookie,
    });
    assertEqual(status, 404, "cross-account read is a not-found");
  });

  await check("another customer's history never contains the order", async () => {
    const { status, body } = await fetchJson("/api/account/orders", { cookie: other.cookie });
    assertEqual(status, 200, "status");
    const numbers = (body.orders as { orderNumber: string }[]).map((order) => order.orderNumber);
    assert(!numbers.includes(orderNumber), "order must not leak into another account");
  });

  await check("a guest order stays unlinked and out of every account", async () => {
    const guestEmail = uniqueEmail("guest");
    const { status, body } = await fetchJson("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        customerName: "Guest Tester",
        customerEmail: guestEmail,
        customerPhone: "9876500001",
        address: {
          line1: "9 Guest Road",
          line2: "",
          city: "Chennai",
          state: "Tamil Nadu",
          postalCode: "600001",
          country: "India",
        },
        notes: "",
        items: [{ productId: serviceId, quantity: 1 }],
      }),
    });
    assertEqual(status, 201, "guest order status");
    const guestOrderNumber = (body.order as { orderNumber: string }).orderNumber;

    const persisted = await Order.findOne({ orderNumber: guestOrderNumber }).lean<{
      customerId: unknown;
    } | null>();
    assertEqual(persisted!.customerId ?? null, null, "guest order has no owner");

    const { body: listBody } = await fetchJson("/api/account/orders", { cookie: owner.cookie });
    const numbers = (listBody.orders as { orderNumber: string }[]).map((order) => order.orderNumber);
    assert(!numbers.includes(guestOrderNumber), "guest order is not attached to an account");
  });

  // The owner session is still needed by the caller? No - kept for clarity.
  assert(Boolean(other.cookie), "second account session established");
}

async function runPageRedirectTests(): Promise<void> {
  console.log("\nAccount page protection");

  await check("/account redirects unauthenticated visitors to sign in", async () => {
    const response = await fetch(`${BASE_URL}/account`, { redirect: "manual" });
    assert(
      response.status >= 300 && response.status < 400,
      `expected a redirect, received ${response.status}`,
    );
    const location = response.headers.get("location") ?? "";
    assert(location.includes("/account/login"), "redirects to the login page");
  });

  await check("/account/login renders the sign-in form", async () => {
    const response = await fetch(`${BASE_URL}/account/login`, { redirect: "manual" });
    assertEqual(response.status, 200, "login page status");
    const html = await response.text();
    assert(/sign in/i.test(html), "login page mentions signing in");
  });
}

async function cleanup(): Promise<void> {
  try {
    const customers = await Customer.find({ email: { $in: createdEmails } }).select("_id").lean<
      { _id: Types.ObjectId }[]
    >();
    const ids = customers.map((customer) => customer._id);

    const [deletedSessions, deletedOrders, deletedCustomers] = await Promise.all([
      CustomerSession.deleteMany({ customerId: { $in: ids } }),
      Order.deleteMany({ customerEmail: { $in: createdEmails } }),
      Customer.deleteMany({ email: { $in: createdEmails } }),
    ]);

    console.log(
      `[cleanup] removed ${deletedCustomers.deletedCount} customer(s), ${deletedSessions.deletedCount} session(s), ${deletedOrders.deletedCount} order(s)`,
    );
  } catch (error) {
    console.error("[cleanup] failed", error);
  }
}

main().catch(async (error: unknown) => {
  console.error(error);
  await disconnectDB().catch(() => undefined);
  process.exit(1);
});
