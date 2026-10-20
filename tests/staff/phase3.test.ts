/**
 * Phase 3 - staff portal integration tests.
 *
 * Requires:
 *   - a seeded development database (npm run seed)
 *   - the dev server running (npm run dev)
 *
 * Run with: npm run test:phase3
 *
 * Covers the staff access contract end to end over real HTTP: generic login
 * failures, account lockout + rate limiting, immediate session issuance for
 * every staff role, direct team creation with an initial password, team
 * management permissions, session revocation on deactivation, and proof that
 * secrets are never stored in the clear.
 */
import bcrypt from "bcryptjs";
import { Types } from "mongoose";

import { BCRYPT_ROUNDS } from "@/lib/constants/customer";
import { STAFF_SESSION_COOKIE } from "@/lib/constants/staff";
import { connectDB, disconnectDB } from "@/lib/db/mongodb";
import { AuditLog } from "@/models/AuditLog";
import { StaffProfile } from "@/models/StaffProfile";
import { StaffSession } from "@/models/StaffSession";
import { loadEnvFiles } from "@/scripts/load-env";

const BASE_URL = process.env.NEXORA_TEST_BASE_URL ?? "http://localhost:3000";
const PASSWORD = "Secret@12345";

let passed = 0;
const failures: string[] = [];
const createdStaffEmails: string[] = [];

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

function uniqueEmail(label: string): string {
  const email = `pos-${label}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@nexora.example`;
  createdStaffEmails.push(email);
  return email;
}

/* ---------------------------------------------------------------------------
 * HTTP harness with a full cookie jar (session + pending + any others).
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
    if (cookie.isExpired) {
      delete jar[cookie.name];
    } else {
      jar[cookie.name] = cookie.value;
    }
  }
}

async function api(
  path: string,
  options: { method?: string; body?: unknown; jar?: CookieJar } = {},
): Promise<{ status: number; body: Record<string, unknown>; response: Response }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const cookie = cookieHeader(options.jar);
  if (cookie) headers.Cookie = cookie;

  const response = await fetch(`${BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
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
 * Fixtures (created directly so tests stay self-contained)
 * ------------------------------------------------------------------------- */

async function insertStaff(input: {
  name: string;
  email: string;
  role: "SUPER_ADMIN" | "MANAGER" | "CASHIER";
  isActive?: boolean;
}): Promise<Types.ObjectId> {
  const passwordHash = await bcrypt.hash(PASSWORD, BCRYPT_ROUNDS);
  const staff = await StaffProfile.create({
    email: input.email,
    passwordHash,
    name: input.name,
    role: input.role,
    isActive: input.isActive ?? true,
    lastLoginAt: null,
    passwordChangedAt: new Date(),
    failedLoginCount: 0,
    lockedUntil: null,
    invitedBy: null,
  });
  if (!createdStaffEmails.includes(input.email)) createdStaffEmails.push(input.email);
  return staff._id as Types.ObjectId;
}

async function staffDoc(email: string) {
  return StaffProfile.findOne({ email }).lean();
}

/** Signs in over HTTP and returns the cookie jar holding a real portal session. */
async function fullSignIn(email: string): Promise<{ jar: CookieJar; role: string }> {
  const jar: CookieJar = {};

  const login = await api("/api/staff/login", {
    method: "POST",
    body: { email, password: PASSWORD },
    jar,
  });
  assertEqual(login.status, 200, "login status");
  assertEqual(login.body.step as string, "COMPLETE", "login next step");
  assert(hasSession(jar), "session issued immediately");

  return { jar, role: (await staffDoc(email))?.role ?? "" };
}

/* ---------------------------------------------------------------------------
 * Test groups
 * ------------------------------------------------------------------------- */

async function runAuthTests(): Promise<void> {
  console.log("\nStaff authentication");

  const unknownEmail = uniqueEmail("unknown");
  const unknownResponse = await api("/api/staff/login", {
    method: "POST",
    body: { email: unknownEmail, password: "WrongPass1" },
  });
  const genericMessage =
    (unknownResponse.body.error as { message?: string } | undefined)?.message ?? "";

  await check("login with unknown email returns a generic 401", async () => {
    assertEqual(unknownResponse.status, 401, "status");
    assertEqual(genericMessage, "Invalid email or password.", "no user enumeration");
  });

  const accountEmail = uniqueEmail("wrongpass");
  await insertStaff({ name: "Wrong Pass", email: accountEmail, role: "CASHIER" });

  const wrongPassResponse = await api("/api/staff/login", {
    method: "POST",
    body: { email: accountEmail, password: "WrongPass1" },
  });

  await check("login with wrong password returns the same generic 401", async () => {
    assertEqual(wrongPassResponse.status, 401, "status");
    assertEqual(
      (wrongPassResponse.body.error as { message?: string })?.message,
      genericMessage,
      "identical message for unknown email and wrong password",
    );
  });

  await check("failed logins persist a bcrypt-worthy failure counter", async () => {
    const doc = await staffDoc(accountEmail);
    assertEqual((doc?.failedLoginCount as number) ?? 0, 1, "failure count incremented");
  });

  const disabledEmail = uniqueEmail("disabled");
  await insertStaff({ name: "Disabled", email: disabledEmail, role: "CASHIER", isActive: false });

  await check("disabled staff get a generic 401 too", async () => {
    const response = await api("/api/staff/login", {
      method: "POST",
      body: { email: disabledEmail, password: PASSWORD },
    });
    assertEqual(response.status, 401, "status");
    assertEqual(
      (response.body.error as { message?: string })?.message,
      genericMessage,
      "disabled accounts do not reveal why access was denied",
    );
  });

  const lockoutEmail = uniqueEmail("lockout");
  await insertStaff({ name: "Lockout", email: lockoutEmail, role: "CASHIER" });

  await check("5 consecutive failures lock the account (still generic)", async () => {
    let lastStatus = 0;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await api("/api/staff/login", {
        method: "POST",
        body: { email: lockoutEmail, password: "WrongPass1" },
      });
      lastStatus = response.status;
      assertEqual(
        (response.body.error as { message?: string })?.message,
        genericMessage,
        "attempt while locked is still generic",
      );
    }
    assertEqual(lastStatus, 401, "locked account still reports 401");

    const doc = await staffDoc(lockoutEmail);
    const lockedUntil = doc?.lockedUntil as Date | null | undefined;
    assert(Boolean(lockedUntil), "lockedUntil is set after MAX_LOGIN_FAILURES");
  });

  await check("lockout is enforced even with a correct password", async () => {
    const response = await api("/api/staff/login", {
      method: "POST",
      body: { email: lockoutEmail, password: PASSWORD },
    });
    assertEqual(response.status, 401, "locked account rejects a valid password");
    assertEqual(
      (response.body.error as { message?: string })?.message,
      genericMessage,
      "no hint that the password was right",
    );
  });

  const hammerEmail = uniqueEmail("hammer");
  await check("login brute force is rate limited (429)", async () => {
    let lastStatus = 0;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await api("/api/staff/login", {
        method: "POST",
        body: { email: hammerEmail, password: "WrongPass1" },
      });
      lastStatus = response.status;
      if (lastStatus === 429) break;
    }
    assertEqual(lastStatus, 429, "rate limiter kicks in after repeated attempts");
  });

  await check("login requires a JSON body", async () => {
    const response = await api("/api/staff/login", { method: "POST", body: null });
    assertEqual(response.status, 400, "malformed body is rejected");
  });
}

async function establishSuperAdmin(): Promise<CookieJar> {
  const email = uniqueEmail("superadmin");
  await insertStaff({ name: "Test Super Admin", email, role: "SUPER_ADMIN" });
  const result = await fullSignIn(email);
  return result.jar;
}

async function establishManager(): Promise<CookieJar> {
  const email = uniqueEmail("manager");
  await insertStaff({ name: "Test Manager", email, role: "MANAGER" });
  const result = await fullSignIn(email);
  return result.jar;
}

async function establishCashier(): Promise<CookieJar> {
  const email = uniqueEmail("cashier");
  await insertStaff({ name: "Test Cashier", email, role: "CASHIER" });
  return (await fullSignIn(email)).jar;
}

async function runTeamCreationTests(superAdminJar: CookieJar): Promise<void> {
  console.log("\nTeam creation");

  const managerEmail = uniqueEmail("directmgr");

  await check("super admin can add a Manager with an initial password", async () => {
    const response = await api("/api/staff/team", {
      method: "POST",
      body: {
        name: "Direct Manager",
        email: managerEmail,
        password: PASSWORD,
        confirmPassword: PASSWORD,
        role: "MANAGER",
      },
      jar: superAdminJar,
    });
    assertEqual(response.status, 201, "create status");
    const staff = response.body.staff as {
      email: string;
      role: string;
      isActive: boolean;
    };
    assertEqual(staff.email, managerEmail, "email returned");
    assertEqual(staff.role, "MANAGER", "role persisted");
    assertEqual(staff.isActive, true, "new account is active");
  });

  await check("an added team member signs in with the password immediately", async () => {
    const jar: CookieJar = {};
    const response = await api("/api/staff/login", {
      method: "POST",
      body: { email: managerEmail, password: PASSWORD },
      jar,
    });
    assertEqual(response.status, 200, "login status");
    assertEqual(response.body.step as string, "COMPLETE", "no verification step");
    assert(hasSession(jar), "session cookie present");
  });

  await check("the initial password is bcrypt at rest (never plaintext)", async () => {
    const doc = await StaffProfile.findOne({ email: managerEmail }).select("+passwordHash");
    const hash = doc?.passwordHash ?? "";
    assert(hash.startsWith("$2"), "password stored as a bcrypt hash");
    assert(!hash.includes(PASSWORD), "plaintext password never stored");
  });

  await check("adding an existing staff email is rejected", async () => {
    const existing = uniqueEmail("taken");
    await insertStaff({ name: "Taken", email: existing, role: "CASHIER" });
    const response = await api("/api/staff/team", {
      method: "POST",
      body: {
        name: "Taken Again",
        email: existing,
        password: PASSWORD,
        confirmPassword: PASSWORD,
        role: "SELLER",
      },
      jar: superAdminJar,
    });
    assertEqual(response.status, 409, "existing staff email rejected");
  });

  await check("unauthenticated callers cannot add team members", async () => {
    const response = await api("/api/staff/team", {
      method: "POST",
      body: {
        name: "Anonymous Add",
        email: uniqueEmail("anon"),
        password: PASSWORD,
        confirmPassword: PASSWORD,
        role: "SELLER",
      },
    });
    assertEqual(response.status, 401, "no session -> 401");
  });

  await check("cashiers cannot add team members", async () => {
    const cashierJar = await establishCashier();
    const response = await api("/api/staff/team", {
      method: "POST",
      body: {
        name: "Cashier Add",
        email: uniqueEmail("cashieradd"),
        password: PASSWORD,
        confirmPassword: PASSWORD,
        role: "SELLER",
      },
      jar: cashierJar,
    });
    assertEqual(response.status, 403, "cashier denied");
  });

  const managerJar = await establishManager();
  await check("managers can add Sellers only", async () => {
    const sellerTarget = uniqueEmail("mgrseller");
    const allowed = await api("/api/staff/team", {
      method: "POST",
      body: {
        name: "Manager Added Seller",
        email: sellerTarget,
        password: PASSWORD,
        confirmPassword: PASSWORD,
        role: "SELLER",
      },
      jar: managerJar,
    });
    assertEqual(allowed.status, 201, "manager -> seller allowed");

    const managerTarget = uniqueEmail("mgrmanager");
    const denied = await api("/api/staff/team", {
      method: "POST",
      body: {
        name: "Manager Adds Manager",
        email: managerTarget,
        password: PASSWORD,
        confirmPassword: PASSWORD,
        role: "MANAGER",
      },
      jar: managerJar,
    });
    assertEqual(denied.status, 403, "manager -> manager forbidden");
  });

  await check("team creation validation rejects weak passwords and mismatches", async () => {
    const target = uniqueEmail("weakadd");

    const weak = await api("/api/staff/team", {
      method: "POST",
      body: {
        name: "Weak Add",
        email: target,
        password: "short",
        confirmPassword: "short",
        role: "SELLER",
      },
      jar: superAdminJar,
    });
    assertEqual(weak.status, 400, "weak password rejected with 400");
    const weakField = weak.body.error as { fieldErrors?: Record<string, string[]> } | undefined;
    assert(Boolean(weakField?.fieldErrors?.password), "password field error surfaced");

    const mismatch = await api("/api/staff/team", {
      method: "POST",
      body: {
        name: "Mismatch Add",
        email: target,
        password: PASSWORD,
        confirmPassword: "Different",
        role: "SELLER",
      },
      jar: superAdminJar,
    });
    assertEqual(mismatch.status, 400, "password mismatch rejected");
    const mismatchField = mismatch.body.error as
      | { fieldErrors?: Record<string, string[]> }
      | undefined;
    assert(
      Boolean(mismatchField?.fieldErrors?.confirmPassword),
      "confirmPassword field error surfaced",
    );
  });

  await check("legacy invitation endpoints no longer exist", async () => {
    const response = await api("/api/staff/invitations", {
      method: "POST",
      body: { email: uniqueEmail("legacy"), role: "SELLER" },
      jar: superAdminJar,
    });
    assertEqual(response.status, 404, "invitation endpoint removed");

    const joinPage = await fetch(`${BASE_URL}/pos/join`, { redirect: "manual" });
    assertEqual(joinPage.status, 404, "join-with-code page removed");
  });
}

async function establishTeamCashier(superAdminJar: CookieJar): Promise<{
  email: string;
  jar: CookieJar;
  staffId: string;
}> {
  const email = uniqueEmail("teamcashier");
  const create = await api("/api/staff/team", {
    method: "POST",
    body: {
      name: "Team Cashier",
      email,
      password: PASSWORD,
      confirmPassword: PASSWORD,
      role: "SELLER",
    },
    jar: superAdminJar,
  });
  assertEqual(create.status, 201, "team cashier created");
  const staff = create.body.staff as { id: string };
  const jar = (await fullSignIn(email)).jar;
  return { email, jar, staffId: staff.id };
}

async function runTeamTests(superAdminJar: CookieJar): Promise<void> {
  console.log("\nTeam access");

  const cashier = await establishTeamCashier(superAdminJar);
  const managerJar = await establishManager();

  await check("team list returns the staff directory to a manager", async () => {
    const response = await api("/api/staff/team", { jar: managerJar });
    assertEqual(response.status, 200, "team list status");
    assert(Array.isArray(response.body.staff), "staff array returned");
    assert(!("invitations" in response.body), "invitations are no longer part of the team payload");
  });

  await check("cashiers are denied the team list", async () => {
    const response = await api("/api/staff/team", { jar: cashier.jar });
    assertEqual(response.status, 403, "cashier forbidden");
  });

  await check("super admin deactivates a cashier (their session dies)", async () => {
    const response = await api(`/api/staff/team/${cashier.staffId}`, {
      method: "PATCH",
      body: { staffId: cashier.staffId, isActive: false },
      jar: superAdminJar,
    });
    assertEqual(response.status, 200, "deactivate status");
    assertEqual((response.body.staff as { isActive: boolean }).isActive, false, "state persisted");

    const me = await api("/api/staff/me", { jar: cashier.jar });
    assertEqual(me.status, 401, "deactivated staff loses portal access immediately");
  });

  await check("re-activating does not revive the revoked session", async () => {
    const response = await api(`/api/staff/team/${cashier.staffId}`, {
      method: "PATCH",
      body: { staffId: cashier.staffId, isActive: true },
      jar: superAdminJar,
    });
    assertEqual(response.status, 200, "activate status");

    const me = await api("/api/staff/me", { jar: cashier.jar });
    assertEqual(me.status, 401, "the pre-deactivation session stays dead");

    const fresh = await api("/api/staff/login", {
      method: "POST",
      body: { email: cashier.email, password: PASSWORD },
    });
    assertEqual(fresh.status, 200, "the reactivated member can sign in again");
  });

  await check("super admin promotes a cashier to manager", async () => {
    const response = await api(`/api/staff/team/${cashier.staffId}`, {
      method: "PATCH",
      body: { staffId: cashier.staffId, role: "MANAGER" },
      jar: superAdminJar,
    });
    assertEqual(response.status, 200, "promote status");
    assertEqual((response.body.staff as { role: string }).role, "MANAGER", "role persisted");
  });

  await check("promoted cashier must sign in again (sessions are revoked on role change)", async () => {
    const portal = await fetch(`${BASE_URL}/pos`, {
      headers: { Cookie: cookieHeader(cashier.jar) },
      redirect: "manual",
    });
    const location = portal.headers.get("location") ?? "";
    assert(location.includes("/account/login"), `portal redirects to unified sign-in, got ${location}`);

    const removedHandoff = await fetch(`${BASE_URL}/pos/activate-mfa`, {
      headers: { Cookie: cookieHeader(cashier.jar) },
      redirect: "manual",
    });
    assertEqual(removedHandoff.status, 404, "the legacy MFA hand-off route does not exist");
  });

  await check("managers cannot deactivate other managers", async () => {
    const response = await api(`/api/staff/team/${cashier.staffId}`, {
      method: "PATCH",
      body: { staffId: cashier.staffId, isActive: false },
      jar: managerJar,
    });
    assertEqual(response.status, 403, "manager -> manager deactivation forbidden");
  });

  await check("managers can deactivate cashiers", async () => {
    const freshCashier = await establishTeamCashier(superAdminJar);
    const response = await api(`/api/staff/team/${freshCashier.staffId}`, {
      method: "PATCH",
      body: { staffId: freshCashier.staffId, isActive: false },
      jar: managerJar,
    });
    assertEqual(response.status, 200, "manager -> cashier deactivation allowed");
  });

  await check("no one can deactivate themselves", async () => {
    const adminMe = await api("/api/staff/me", { jar: superAdminJar });
    const adminId = (adminMe.body.staff as { id: string }).id;
    const response = await api(`/api/staff/team/${adminId}`, {
      method: "PATCH",
      body: { staffId: adminId, isActive: false },
      jar: superAdminJar,
    });
    assertEqual(response.status, 403, "self-deactivation forbidden");

    const managerMe = await api("/api/staff/me", { jar: managerJar });
    const managerId = (managerMe.body.staff as { id: string }).id;
    const managerSelf = await api(`/api/staff/team/${managerId}`, {
      method: "PATCH",
      body: { staffId: managerId, role: "CASHIER" },
      jar: managerJar,
    });
    assertEqual(managerSelf.status, 403, "self-demotion forbidden");
  });

  await check("super-admin accounts can never be modified by anyone", async () => {
    const adminMe = await api("/api/staff/me", { jar: superAdminJar });
    const adminId = (adminMe.body.staff as { id: string }).id;
    const response = await api(`/api/staff/team/${adminId}`, {
      method: "PATCH",
      body: { staffId: adminId, role: "CASHIER" },
      jar: superAdminJar,
    });
    assertEqual(response.status, 403, "super-admin role is untouchable");
  });

  await check("managers cannot change any roles", async () => {
    const response = await api(`/api/staff/team/${cashier.staffId}`, {
      method: "PATCH",
      body: { staffId: cashier.staffId, role: "CASHIER" },
      jar: managerJar,
    });
    assertEqual(response.status, 403, "role changes require a super admin");
  });

  await check("route param and body staffId must agree", async () => {
    const response = await api(`/api/staff/team/${cashier.staffId}`, {
      method: "PATCH",
      body: { staffId: "0".repeat(24), isActive: true },
      jar: superAdminJar,
    });
    assertEqual(response.status, 400, "mismatched id rejected");
  });
}

async function runSessionTests(): Promise<void> {
  console.log("\nSessions");

  const email = uniqueEmail("session");
  await insertStaff({ name: "Session Staff", email, role: "CASHIER" });

  await check("/api/staff/me requires a session", async () => {
    const response = await api("/api/staff/me");
    assertEqual(response.status, 401, "anonymous -> 401");
  });

  const jar = (await fullSignIn(email)).jar;

  await check("/api/staff/me returns the signed-in profile", async () => {
    const response = await api("/api/staff/me", { jar });
    assertEqual(response.status, 200, "me status");
    assertEqual((response.body.staff as { email: string }).email, email, "email matches");
    assertEqual((response.body.staff as { role: string }).role, "CASHIER", "role matches");
    const member = response.body.staff as Record<string, unknown>;
    assert(
      !("passwordHash" in member) && !("mfaSecretEncrypted" in member),
      "me never leaks password hashes or removed legacy fields",
    );
  });

  await check("logout revokes the token server-side", async () => {
    const response = await api("/api/staff/logout", { method: "POST", body: {}, jar });
    assertEqual(response.status, 200, "logout status");

    const me = await api("/api/staff/me", { jar });
    assertEqual(me.status, 401, "session gone after logout");

    const doc = await staffDoc(email);
    const remaining = await StaffSession.countDocuments({ staffId: doc?._id });
    assertEqual(remaining, 0, "no StaffSession row left for this staff member");
  });
}

async function runGuardTests(superAdminJar: CookieJar): Promise<void> {
  console.log("\nPortal page guards");

  await check("/pos redirects anonymous visitors to sign in", async () => {
    const response = await fetch(`${BASE_URL}/pos`, { redirect: "manual" });
    const location = response.headers.get("location") ?? "";
    assert(location.includes("/account/login"), `redirects to login, got ${location}`);
  });

  await check("/pos/team redirects anonymous visitors to sign in", async () => {
    const response = await fetch(`${BASE_URL}/pos/team`, { redirect: "manual" });
    const location = response.headers.get("location") ?? "";
    assert(location.includes("/account/login"), `redirects to login, got ${location}`);
  });

  await check("the old POS login redirects to the unified login", async () => {
    const response = await fetch(`${BASE_URL}/pos/login`, { redirect: "manual" });
    assertEqual(response.status, 307, "legacy login redirect status");
    assert((response.headers.get("location") ?? "").includes("/account/login"), "unified login target");
  });

  await check("a signed-in staff member is not shown the public login form", async () => {
    const response = await fetch(`${BASE_URL}/pos/login`, {
      headers: { Cookie: cookieHeader(superAdminJar) },
      redirect: "manual",
    });
    const location = response.headers.get("location") ?? "";
    assert(location.includes("/pos"), `redirected into the portal, got ${location}`);
  });

  await check("dashboard loads for a signed-in super admin", async () => {
    const response = await fetch(`${BASE_URL}/pos`, {
      headers: { Cookie: cookieHeader(superAdminJar) },
      redirect: "manual",
    });
    assertEqual(response.status, 200, "dashboard status");
    const html = await response.text();
    assert(/welcome back/i.test(html), "dashboard content present");
  });

  const cashierEmail = uniqueEmail("guardcash");
  await insertStaff({ name: "Guard Cashier", email: cashierEmail, role: "CASHIER" });
  const cashier = await fullSignIn(cashierEmail);

  await check("cashiers cannot open restricted modules", async () => {
    const teamPage = await fetch(`${BASE_URL}/pos/team`, {
      headers: { Cookie: cookieHeader(cashier.jar) },
      redirect: "manual",
    });
    const location = teamPage.headers.get("location") ?? "";
    assert(
      location.endsWith("/pos") || location.includes("/pos?"),
      `cashier bounced to dashboard, got ${location}`,
    );
  });

  await check("portal pages are hidden from search engines", async () => {
    const response = await fetch(`${BASE_URL}/account/login`, { redirect: "manual" });
    const html = await response.text();
    assert(/noindex/i.test(html), "login page carries noindex");
  });
}

async function cleanup(): Promise<void> {
  try {
    const staff = await StaffProfile.find({ email: { $in: createdStaffEmails } })
      .select("_id email")
      .lean<{ _id: Types.ObjectId; email: string }[]>();
    const ids = staff.map((member) => member._id);

    const [deletedSessions, deletedAudit, deletedStaff] = await Promise.all([
      StaffSession.deleteMany({ staffId: { $in: ids } }),
      AuditLog.deleteMany({
        $or: [{ actorStaffId: { $in: ids } }, { targetStaffId: { $in: ids } }],
      }),
      StaffProfile.deleteMany({ email: { $in: createdStaffEmails } }),
    ]);

    console.log(
      `[cleanup] removed ${deletedStaff.deletedCount} staff, ${deletedSessions.deletedCount} sessions, ${deletedAudit.deletedCount} audit entries`,
    );
  } catch (error) {
    console.error("[cleanup] failed", error);
  }
}

async function main(): Promise<void> {
  loadEnvFiles();
  await connectDB();

  try {
    const superAdminJar = await establishSuperAdmin();
    await runAuthTests();
    await runTeamCreationTests(superAdminJar);
    await runTeamTests(superAdminJar);
    await runSessionTests();
    await runGuardTests(superAdminJar);
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
