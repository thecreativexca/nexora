/**
 * Unit tests for the pure cart, validation and money logic.
 *
 * Run with: npm run test:unit
 */
import { mergeCartDraftLines } from "@/lib/cart/cart-lines";
import {
  addLine,
  cartItemCount,
  cartSubtotalInPaise,
  clampQuantity,
  decrementLine,
  incrementLine,
  isLineOrderable,
  removeLine,
  setLineQuantity,
} from "@/lib/cart/cart-logic";
import { formatMoney } from "@/lib/utils/money";
import { generateOrderNumber, isWellFormedOrderNumber } from "@/lib/utils/order-number";
import { buildContainsRegExp, escapeRegExp, normalizeSearchTerm } from "@/lib/utils/search";
import { parseStoredCart } from "@/lib/validations/cart";
import { catalogQuerySchema, parseCatalogQuery } from "@/lib/validations/catalog-query";
import {
  customerLoginSchema,
  customerProfileSchema,
  customerRegistrationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyResetOtpSchema,
} from "@/lib/validations/customer";
import { checkoutSchema } from "@/lib/validations/order";
import { categoryCreateSchema } from "@/lib/validations/pos";
import type { CartLine } from "@/types/cart";

const PHONE_ID = "64b7f1c2a4d3e5f60718293a";
const SERVICE_ID = "64b7f1c2a4d3e5f60718293b";

let passed = 0;
const failures: string[] = [];

function check(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures.push(name);
    const message = error instanceof Error ? error.message : String(error);
    console.error(`  FAIL ${name}\n         ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function assertTrue(value: boolean, label: string): void {
  if (!value) throw new Error(`${label}: expected true`);
}

function assertFalse(value: boolean, label: string): void {
  if (value) throw new Error(`${label}: expected false`);
}

function phoneLine(overrides: Partial<CartLine> = {}): CartLine {
  return {
    productId: PHONE_ID,
    slug: "test-phone",
    name: "Test Phone",
    image: "",
    unitPriceInPaise: 10_00,
    isService: false,
    stockLimit: 3,
    quantity: 1,
    addedAt: 1,
    ...overrides,
  };
}

function serviceLine(overrides: Partial<CartLine> = {}): CartLine {
  return {
    productId: SERVICE_ID,
    slug: "test-service",
    name: "Test Service",
    image: "",
    unitPriceInPaise: 5_00,
    isService: true,
    stockLimit: null,
    quantity: 1,
    addedAt: 2,
    ...overrides,
  };
}

console.log("\nCart quantity rules");

check("quantity is clamped to at least 1 and never decimal", () => {
  assertEqual(clampQuantity(0, null), 1, "zero");
  assertEqual(clampQuantity(-5, null), 1, "negative");
  assertEqual(clampQuantity(2.7, null), 2, "decimal");
  assertEqual(clampQuantity(Number.NaN, null), 1, "NaN");
});

check("physical quantity is capped by available stock", () => {
  assertEqual(clampQuantity(10, 2), 2, "stock cap");
  assertEqual(clampQuantity(1, 0), 1, "zero stock never produces a 0 quantity");
});

check("absurd quantities are capped at the global ceiling", () => {
  assertEqual(clampQuantity(100000, null), 99, "global cap");
});

check("adding the same product twice increases the quantity", () => {
  const once = addLine([], phoneLine(), 1);
  const twice = addLine(once, phoneLine(), 1);
  assertEqual(twice.length, 1, "line count");
  assertEqual(twice[0].quantity, 2, "quantity");
});

check("adding beyond stock stops at the stock limit", () => {
  const lines = addLine([], phoneLine(), 3);
  const overflow = addLine(lines, phoneLine(), 5);
  assertEqual(overflow[0].quantity, 3, "quantity capped at stock");
});

check("services ignore stock limits entirely", () => {
  const lines = addLine([], serviceLine(), 4);
  assertEqual(lines[0].quantity, 4, "service quantity");
  assertTrue(isLineOrderable(lines[0]), "service orderable");
});

check("increment and decrement adjust quantity", () => {
  const lines = addLine([], phoneLine(), 1);
  assertEqual(incrementLine(lines, PHONE_ID)[0].quantity, 2, "increment");
  assertEqual(
    decrementLine(incrementLine(lines, PHONE_ID), PHONE_ID)[0].quantity,
    1,
    "decrement",
  );
});

check("decrementing the last unit removes the line", () => {
  const lines = addLine([], phoneLine(), 1);
  assertEqual(decrementLine(lines, PHONE_ID).length, 0, "line removed");
});

check("setQuantity clamps invalid input instead of storing it", () => {
  const lines = addLine([], phoneLine(), 1);
  assertEqual(setLineQuantity(lines, PHONE_ID, 0)[0].quantity, 1, "zero becomes 1");
  assertEqual(setLineQuantity(lines, PHONE_ID, 2.9)[0].quantity, 2, "decimal truncated");
  assertEqual(setLineQuantity(lines, PHONE_ID, 99)[0].quantity, 3, "stock capped");
});

check("remove and totals behave", () => {
  const lines = [phoneLine({ quantity: 2 }), serviceLine({ quantity: 3 })];
  assertEqual(cartItemCount(lines), 5, "item count");
  assertEqual(cartSubtotalInPaise(lines), 2 * 10_00 + 3 * 5_00, "subtotal");
  assertEqual(removeLine(lines, PHONE_ID).length, 1, "removed line");
});

check("an out-of-stock physical line is not orderable", () => {
  assertFalse(isLineOrderable(phoneLine({ stockLimit: 0 })), "stock 0");
});

check("duplicate ids sent to the server are merged", () => {
  const merged = mergeCartDraftLines([
    { productId: PHONE_ID, quantity: 1 },
    { productId: PHONE_ID, quantity: 2 },
    { productId: SERVICE_ID, quantity: 1 },
  ]);
  assertEqual(merged.length, 2, "merged line count");
  assertEqual(merged[0].quantity, 3, "summed quantity");
});

console.log("\nPersisted bag is treated as untrusted input");

check("a valid saved bag is restored", () => {
  assertEqual(parseStoredCart(JSON.stringify([phoneLine()])).length, 1, "restored lines");
});

check("tampered or malformed bags are dropped safely", () => {
  assertEqual(parseStoredCart(null).length, 0, "null");
  assertEqual(parseStoredCart("not-json").length, 0, "invalid json");
  assertEqual(parseStoredCart('{"lines":[]}').length, 0, "wrong root type");
  assertEqual(
    parseStoredCart(JSON.stringify([{ productId: "nope", quantity: 1 }])).length,
    0,
    "invalid object id",
  );
  assertEqual(
    parseStoredCart(JSON.stringify([{ ...phoneLine(), quantity: 0 }])).length,
    0,
    "zero quantity",
  );
  assertEqual(
    parseStoredCart(JSON.stringify([{ ...phoneLine(), quantity: -3 }])).length,
    0,
    "negative quantity",
  );
  assertEqual(
    parseStoredCart(JSON.stringify([{ ...phoneLine(), quantity: 1.5 }])).length,
    0,
    "decimal quantity",
  );
  assertEqual(
    parseStoredCart(JSON.stringify([{ ...phoneLine(), unitPriceInPaise: "free" }])).length,
    0,
    "string price",
  );
});

console.log("\nCheckout validation (server-side contract)");

const validCheckout = {
  customerName: "Asha Menon",
  customerEmail: "asha@example.com",
  customerPhone: "+91 98765 43210",
  address: {
    line1: "12 MG Road",
    line2: "",
    city: "Bengaluru",
    state: "Karnataka",
    postalCode: "560001",
    country: "India",
  },
  notes: "",
  items: [{ productId: PHONE_ID, quantity: 2 }],
};

check("a valid guest checkout payload passes", () => {
  const result = checkoutSchema.safeParse(validCheckout);
  assertTrue(result.success, "parse success");
  if (result.success) assertEqual(result.data.paymentMethod, "CASH", "Offline cash default");
});

check("public checkout accepts COD cash and rejects alternate tenders", () => {
  assertTrue(checkoutSchema.safeParse({ ...validCheckout, paymentMethod: "CASH" }).success, "COD accepted");
  assertFalse(checkoutSchema.safeParse({ ...validCheckout, paymentMethod: "UPI" }).success, "UPI rejected");
  assertFalse(checkoutSchema.safeParse({ ...validCheckout, paymentMethod: "CARD" }).success, "card rejected");
});

check("catalogue image fields reject application routes such as /moblie", () => {
  assertFalse(categoryCreateSchema.safeParse({ name: "Mobile", image: "/moblie" }).success, "bad route rejected");
  assertTrue(categoryCreateSchema.safeParse({ name: "Mobile", image: "https://example.com/mobile.webp" }).success, "remote image accepted");
});

check("invalid email, phone, postal code and quantity are rejected", () => {
  assertFalse(checkoutSchema.safeParse({ ...validCheckout, customerEmail: "nope" }).success, "email");
  assertFalse(
    checkoutSchema.safeParse({ ...validCheckout, customerPhone: "12" }).success,
    "phone",
  );
  assertFalse(
    checkoutSchema.safeParse({
      ...validCheckout,
      address: { ...validCheckout.address, postalCode: "!" },
    }).success,
    "postal code",
  );
  assertFalse(
    checkoutSchema.safeParse({
      ...validCheckout,
      items: [{ productId: PHONE_ID, quantity: 0 }],
    }).success,
    "quantity 0",
  );
  assertFalse(
    checkoutSchema.safeParse({
      ...validCheckout,
      items: [{ productId: PHONE_ID, quantity: 1.5 }],
    }).success,
    "decimal quantity",
  );
  assertFalse(
    checkoutSchema.safeParse({
      ...validCheckout,
      items: [{ productId: "not-an-object-id", quantity: 1 }],
    }).success,
    "invalid object id",
  );
  assertFalse(checkoutSchema.safeParse({ ...validCheckout, items: [] }).success, "empty bag");
});

check("browser-supplied prices and totals are ignored, not trusted", () => {
  const result = checkoutSchema.safeParse({
    ...validCheckout,
    subtotalInPaise: 1,
    totalInPaise: 1,
    items: [{ productId: PHONE_ID, quantity: 2, unitPriceInPaise: 1, lineTotalInPaise: 2 }],
  });
  assertTrue(result.success, "parse success");
  if (result.success) {
    const serialised = JSON.stringify(result.data);
    assertFalse(serialised.includes("totalInPaise"), "total stripped");
    assertFalse(serialised.includes("unitPriceInPaise"), "unit price stripped");
    assertEqual(result.data.items[0].quantity, 2, "quantity kept");
  }
});

check("password reset contracts require email, six digits and matching strong passwords", () => {
  assertTrue(forgotPasswordSchema.safeParse({ email: "asha@example.com" }).success, "email accepted");
  assertTrue(verifyResetOtpSchema.safeParse({ email: "asha@example.com", otp: "123456" }).success, "OTP accepted");
  assertFalse(verifyResetOtpSchema.safeParse({ email: "asha@example.com", otp: "12345x" }).success, "non-six-digit OTP rejected");
  assertTrue(resetPasswordSchema.safeParse({ resetToken: "x".repeat(32), password: "NewPass@123", confirmPassword: "NewPass@123" }).success, "matching password accepted");
  assertFalse(resetPasswordSchema.safeParse({ resetToken: "x".repeat(32), password: "short", confirmPassword: "short" }).success, "short password rejected");
  assertFalse(resetPasswordSchema.safeParse({ resetToken: "x".repeat(32), password: "NewPass@123", confirmPassword: "Different@123" }).success, "mismatch rejected");
});

console.log("\nCatalogue query parsing");

check("invalid sorts and pages are rejected by the strict API schema", () => {
  assertFalse(catalogQuerySchema.safeParse({ sort: "DROP TABLE" }).success, "invalid sort");
  assertFalse(catalogQuerySchema.safeParse({ page: "-1" }).success, "negative page");
  assertFalse(catalogQuerySchema.safeParse({ page: "abc" }).success, "non numeric page");
});

check("page URLs fall back to safe defaults", () => {
  const query = parseCatalogQuery({ page: "-3", sort: "nonsense", q: "  gaming  " });
  assertEqual(query.page, 1, "page fallback");
  assertEqual(query.sort, "newest", "sort fallback");
  assertEqual(query.search, "gaming", "trimmed search");
  assertEqual(query.categorySlug, "", "no category");
});

check("array query values do not crash parsing", () => {
  const query = parseCatalogQuery({ q: ["first", "second"], category: ["laptops"] });
  assertEqual(query.search, "first", "first array value used");
  assertEqual(query.categorySlug, "laptops", "category slug normalised");
});

check("an over-long search term is clamped rather than executed", () => {
  const query = parseCatalogQuery({ q: "x".repeat(500) });
  assertTrue(query.search.length <= 60, "search length clamped");
});

console.log("\nSearch escaping and money formatting");

check("regex metacharacters in a search term are escaped", () => {
  assertEqual(escapeRegExp("a.*b("), "a\\.\\*b\\(", "escaped output");
  const pattern = buildContainsRegExp(".*");
  assertTrue(pattern.test("a .* b"), "literal match still works");
  assertFalse(pattern.test("anything"), "wildcards are not honoured");
});

check("search terms are normalised", () => {
  assertEqual(normalizeSearchTerm("  iphone   15  "), "iphone 15", "collapsed whitespace");
  assertEqual(normalizeSearchTerm(null), "", "null handled");
});

check("money is formatted from integer paise", () => {
  assertTrue(formatMoney(49999).includes("499.99"), "499.99 rendered");
  assertTrue(formatMoney(0).includes("0.00"), "zero rendered");
});

console.log("\nOrder numbers");

check("generated order numbers are unique and well formed", () => {
  const first = generateOrderNumber();
  assertTrue(isWellFormedOrderNumber(first), `format of ${first}`);
  assertFalse(isWellFormedOrderNumber("NX-20260921-abc123"), "lowercase rejected");
  assertFalse(isWellFormedOrderNumber("NX-123-K7M2QF"), "bad date rejected");
  const generated = new Set(Array.from({ length: 500 }, () => generateOrderNumber()));
  assertEqual(generated.size, 500, "500 unique numbers");
});

console.log("\nCustomer account validation (server-side contract)");

check("a valid registration passes and optional phone defaults to empty", () => {
  const result = customerRegistrationSchema.safeParse({
    name: "Asha Menon",
    email: "Asha@Example.com",
    password: "Secret@123",
    confirmPassword: "Secret@123",
  });
  assertTrue(result.success, "parse success");
  if (result.success) {
    assertEqual(result.data.phone, "", "phone defaults to empty string");
    assertEqual(result.data.email, "Asha@Example.com", "email kept for later normalisation");
  }
});

check("registration rejects short, over-long and mismatched passwords", () => {
  const base = { name: "Asha Menon", email: "asha@example.com", phone: "" };
  assertFalse(
    customerRegistrationSchema.safeParse({
      ...base,
      password: "short",
      confirmPassword: "short",
    }).success,
    "too short",
  );
  assertFalse(
    customerRegistrationSchema.safeParse({
      ...base,
      password: "x".repeat(73),
      confirmPassword: "x".repeat(73),
    }).success,
    "too long",
  );
  assertFalse(
    customerRegistrationSchema.safeParse({
      ...base,
      password: "Secret@123",
      confirmPassword: "Secret@124",
    }).success,
    "mismatch",
  );
});

check("registration rejects bad emails and phone numbers but allows a blank phone", () => {
  const base = { name: "Asha Menon", password: "Secret@123", confirmPassword: "Secret@123" };
  assertFalse(
    customerRegistrationSchema.safeParse({ ...base, email: "nope", phone: "" }).success,
    "bad email",
  );
  assertFalse(
    customerRegistrationSchema.safeParse({ ...base, email: "a@b.co", phone: "12" }).success,
    "bad phone",
  );
  assertTrue(
    customerRegistrationSchema.safeParse({ ...base, email: "a@b.co", phone: "" }).success,
    "blank phone allowed",
  );
});

check("login requires a non-empty password", () => {
  assertTrue(
    customerLoginSchema.safeParse({ email: "asha@example.com", password: "Secret@123" }).success,
    "valid login",
  );
  assertFalse(customerLoginSchema.safeParse({ email: "asha@example.com", password: "" }).success, "empty password");
  assertFalse(customerLoginSchema.safeParse({ email: "nope", password: "Secret@123" }).success, "bad email");
});

check("a profile with a blank address clears the saved address", () => {
  const result = customerProfileSchema.safeParse({
    name: "Asha Menon",
    phone: "",
    address: { line1: "", line2: "", city: "", state: "", postalCode: "", country: "" },
  });
  assertTrue(result.success, "parse success");
  if (result.success) {
    assertEqual(result.data.address, undefined, "blank address removed");
  }
});

check("a partially filled address is rejected rather than silently dropped", () => {
  assertFalse(
    customerProfileSchema.safeParse({
      name: "Asha Menon",
      phone: "",
      address: {
        line1: "12 MG Road",
        line2: "",
        city: "",
        state: "",
        postalCode: "",
        country: "India",
      },
    }).success,
    "incomplete address",
  );
  assertTrue(
    customerProfileSchema.safeParse({
      name: "Asha Menon",
      phone: "",
      address: {
        line1: "12 MG Road",
        line2: "",
        city: "Bengaluru",
        state: "Karnataka",
        postalCode: "560001",
        country: "India",
      },
    }).success,
    "complete address",
  );
});

console.log(`\nUnit tests: ${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.error(`Failed checks:\n  - ${failures.join("\n  - ")}`);
  process.exit(1);
}

