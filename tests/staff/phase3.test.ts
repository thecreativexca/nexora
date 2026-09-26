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
 * failures, account lockout + rate limiting, mandatory TOTP/MFA (setup and
 * verify), the invitation lifecycle (create -> check -> accept, replay
 * prevention, expiry), team management permissions, session revocation on
 * deactivation, and proof that secrets are never stored in the clear.
 */
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { Types } from "mongoose";
import { Secret, TOTP } from "otpauth";

import { BCRYPT_ROUNDS } from "@/lib/constants/customer";
import { STAFF_SESSION_COOKIE, STAFF_MFA_PENDING_COOKIE } from "@/lib/constants/staff";
import { connectDB, disconnectDB } from "@/lib/db/mongodb";
import { AuditLog } from "@/models/AuditLog";
import { StaffInvitation } from "@/models/StaffInvitation";
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

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Full 6-digit TOTP code for a plaintext base32 secret. */
function totpCode(secret: string): string {
  return new TOTP({
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  }).generate();
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

function hasPending(jar: CookieJar): boolean {
  return Boolean(jar[STAFF_MFA_PENDING_COOKIE]);
}

/* ---------------------------------------------------------------------------
 * Fixtures (created directly so tests stay self-contained)
 * ------------------------------------------------------------------------- */

async function insertStaff(input: {
  name: string;
  email: string;
  role: "SUPER_ADMIN" | "MANAGER" | "CASHIER";
  isActive?: boolean;
  mfaEnabled?: boolean;
  mfaSecretEncrypted?: string | null;
}): Promise<Types.ObjectId> {
  const passwordHash = await bcrypt.hash(PASSWORD, BCRYPT_ROUNDS);
  const staff = await StaffProfile.create({
    email: input.email,
    passwordHash,
    name: input.name,
    role: input.role,
    isActive: input.isActive ?? true,
    mfaEnabled: input.mfaEnabled ?? false,
    mfaSecretEncrypted: input.mfaSecretEncrypted ?? null,
    mfaVerifiedAt: null,
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

/**
 * Logs in and completes ANY required MFA, returning a real portal session.
 * `expectStep` verifies the intermediate hand-offs for the raw login call.
 */
async function fullSignIn(
  email: string,
  expectStep: "COMPLETE" | "MFA_SETUP" | "MFA_VERIFY",
): Promise<{ jar: CookieJar; role: string; secret?: string }> {
  const jar: CookieJar = {};

  const login = await api("/api/staff/login", {
    method: "POST",
    body: { email, password: PASSWORD },
    jar,
  });
  assertEqual(login.status, 200, "login status");
  assertEqual(login.body.step as string, expectStep, "login next step");

  if (expectStep === "COMPLETE") {
    assert(hasSession(jar), "cashier session issued immediately");
    return { jar, role: (await staffDoc(email))?.role ?? "" };
  }

  assert(!hasSession(jar), "no session before MFA completes");
  assert(hasPending(jar), "pending MFA cookie set after password step");

  const setup = await api("/api/staff/mfa/setup", { method: "POST", body: {}, jar });
  assertEqual(setup.status, 200, "mfa setup status");
  const secret = setup.body.secret as string;
  assert(await verifyMfa(jar, secret), "MFA verify completes");
  return { jar, role: (await staffDoc(email))?.role ?? "", secret };
}

/** Completes the MFA verify step using a correctly generated code. */
async function verifyMfa(jar: CookieJar, secret: string): Promise<boolean> {
  const result = await api("/api/staff/mfa/verify", {
    method: "POST",
    body: { code: totpCode(secret) },
    jar,
  });
  if (result.status !== 200) return false;
  assert(!hasPending(jar), "pending cookie cleared after MFA");
  assert(hasSession(jar), "full session issued after MFA");
  return true;
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
  const result = await fullSignIn(email, "MFA_SETUP");
  return result.jar;
}

async function establishManager(): Promise<CookieJar> {
  const email = uniqueEmail("manager");
  await insertStaff({ name: "Test Manager", email, role: "MANAGER" });
  const result = await fullSignIn(email, "MFA_SETUP");
  return result.jar;
}

async function establishCashier(): Promise<CookieJar> {
  const email = uniqueEmail("cashier");
  await insertStaff({ name: "Test Cashier", email, role: "CASHIER" });
  return (await fullSignIn(email, "COMPLETE")).jar;
}

async function runMfaTests(): Promise<void> {
  console.log("\nMFA");

  const jwtEmail = uniqueEmail("mfajoin");
  await insertStaff({ name: "MFA Staff", email: jwtEmail, role: "MANAGER" });

  await check("mfa/setup is refused without the pending cookie", async () => {
    const response = await api("/api/staff/mfa/setup", { method: "POST", body: {} });
    assertEqual(response.status, 403, "setup requires the pre-auth cookie");
    assertEqual(
      (response.body.error as { code?: string })?.code,
      "MFA_SETUP_REQUIRED",
      "error code",
    );
  });

  await check("mfa/verify is refused without the pending cookie", async () => {
    const response = await api("/api/staff/mfa/verify", {
      method: "POST",
      body: { code: "123456" },
    });
    assertEqual(response.status, 403, "verify requires the pre-auth cookie");
  });

  const jar: CookieJar = {};
  const login = await api("/api/staff/login", {
    method: "POST",
    body: { email: jwtEmail, password: PASSWORD },
    jar,
  });
  assertEqual(login.body.step as string, "MFA_SETUP", "manager without MFA goes to setup");

  const setupResponse = await api("/api/staff/mfa/setup", { method: "POST", body: {}, jar });
  await check("mfa setup exposes a QR + manual secret", async () => {
    assertEqual(setupResponse.status, 200, "setup status");
    const qr = setupResponse.body.qrDataUrl as string;
    assert(qr.startsWith("data:image/png;base64,"), "QR code is a PNG data URL");
    const uri = setupResponse.body.otpauthUri as string;
    assert(uri.startsWith("otpauth://totp/"), "otpauth URI is well formed");
    assert((setupResponse.body.secret as string).length >= 32, "base32 secret present");
  });

  const secret = setupResponse.body.secret as string;

  await check("mfa verify rejects a wrong code", async () => {
    const response = await api("/api/staff/mfa/verify", {
      method: "POST",
      body: { code: "000000" },
      jar,
    });
    assertEqual(response.status, 422, "wrong code is rejected");
    assert(!hasSession(jar), "no session granted on a wrong code");
  });

  await check("mfa verify accepts the correct code and issues a session", async () => {
    const ok = await verifyMfa(jar, secret);
    assert(ok, "correct code completes MFA and grants a full session");
  });

  await check("mfa enrolment is persisted encrypted", async () => {
    const doc = await StaffProfile.findOne({ email: jwtEmail }).select("+mfaSecretEncrypted");
    assertEqual(doc?.mfaEnabled, true, "mfaEnabled flag set");
    const stored = doc?.mfaSecretEncrypted ?? "";
    assert(stored.length > 40, "an encrypted payload is stored");
    assert(stored !== secret, "the plaintext secret is never stored");
    assert(!stored.includes(secret), "plaintext secret not embedded in ciphertext");
  });

  await check("mfa audit trail records setup", async () => {
    const staff = await staffDoc(jwtEmail);
    const action = await AuditLog.findOne({
      targetStaffId: staff?._id,
      action: { $in: ["STAFF_MFA_ENABLED", "STAFF_MFA_VERIFIED"] },
    }).lean();
    assert(Boolean(action), "an MFA audit entry exists");
  });

  await check("next login routes an enrolled manager to MFA_VERIFY", async () => {
    const nextJar: CookieJar = {};
    const response = await api("/api/staff/login", {
      method: "POST",
      body: { email: jwtEmail, password: PASSWORD },
      jar: nextJar,
    });
    assertEqual(response.status, 200, "login status");
    assertEqual(response.body.step as string, "MFA_VERIFY", "enrolled account verifies only");
    const ok = await verifyMfa(nextJar, secret);
    assert(ok, "verify step completes");
  });

  await check("mfa/verify is brute force rate limited", async () => {
    const hammerName = uniqueEmail("mfarate");
    await insertStaff({ name: "MFA Rate", email: hammerName, role: "MANAGER" });
    const hammerJar: CookieJar = {};
    await api("/api/staff/login", {
      method: "POST",
      body: { email: hammerName, password: PASSWORD },
      jar: hammerJar,
    });
    await api("/api/staff/mfa/setup", { method: "POST", body: {}, jar: hammerJar });

    let lastStatus = 0;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await api("/api/staff/mfa/verify", {
        method: "POST",
        body: { code: "000000" },
        jar: hammerJar,
      });
      lastStatus = response.status;
      if (lastStatus === 429) break;
    }
    assertEqual(lastStatus, 429, "MFA verification is throttled");
  });

  await check("cashier MFA setup is refused (not required)", async () => {
    const cashierEmail = uniqueEmail("mfacashier");
    await insertStaff({ name: "MFA Cashier", email: cashierEmail, role: "CASHIER" });
    const cashierJar: CookieJar = {};
    await api("/api/staff/login", {
      method: "POST",
      body: { email: cashierEmail, password: PASSWORD },
      jar: cashierJar,
    });
    const response = await api("/api/staff/mfa/setup", {
      method: "POST",
      body: {},
      jar: cashierJar,
    });
    assertEqual(response.status, 403, "cashiers cannot enter the MFA setup path");
    assert(Boolean(hasSession(cashierJar)), "cashier still holds a real session");
  });
}

async function runInvitationTests(superAdminJar: CookieJar): Promise<void> {
  console.log("\nInvitations");

  const directorName = uniqueEmail("dir");
  let invitationA: { code: string; invitationId: string; email: string } | null = null;

  await check("super admin can invite a Manager", async () => {
    const response = await api("/api/staff/invitations", {
      method: "POST",
      body: { email: directorName, role: "MANAGER" },
      jar: superAdminJar,
    });
    assertEqual(response.status, 201, "create invitation status");
    const code = response.body.code as string;
    const invitation = response.body.invitation as { id: string; status: string };
    assert(code.length >= 12, "a one-time code is returned");
    assertEqual(invitation.status, "PENDING", "invitation starts pending");
    invitationA = { code, invitationId: invitation.id, email: directorName };
  });

  await check("invitation codes are hashed at rest", async () => {
    const row = await StaffInvitation.findById(invitationA!.invitationId).lean();
    const codeHash = row?.codeHash as string;
    assert(codeHash !== invitationA!.code, "the raw code is not stored");
    assert(codeHash.length === 64, "the stored value is a SHA-256 hash");
  });

  await check("a duplicate pending invitation is rejected", async () => {
    const response = await api("/api/staff/invitations", {
      method: "POST",
      body: { email: directorName, role: "CASHIER" },
      jar: superAdminJar,
    });
    assertEqual(response.status, 409, "duplicate invitation rejected");
  });

  await check("inviting an existing staff email is rejected", async () => {
    const existing = uniqueEmail("taken");
    await insertStaff({ name: "Taken", email: existing, role: "CASHIER" });
    const response = await api("/api/staff/invitations", {
      method: "POST",
      body: { email: existing, role: "CASHIER" },
      jar: superAdminJar,
    });
    assertEqual(response.status, 409, "existing staff email rejected");
  });

  await check("unauthenticated callers cannot create invitations", async () => {
    const response = await api("/api/staff/invitations", {
      method: "POST",
      body: { email: uniqueEmail("anon"), role: "CASHIER" },
    });
    assertEqual(response.status, 401, "no session -> 401");
  });

  await check("cashiers cannot create invitations", async () => {
    const cashierJar = await establishCashier();
    const response = await api("/api/staff/invitations", {
      method: "POST",
      body: { email: uniqueEmail("cashierinv"), role: "CASHIER" },
      jar: cashierJar,
    });
    assertEqual(response.status, 403, "cashier denied");
  });

  const managerJar = await establishManager();
  await check("managers can invite Cashiers only", async () => {
    const cashierTarget = uniqueEmail("mgrcash");
    const response = await api("/api/staff/invitations", {
      method: "POST",
      body: { email: cashierTarget, role: "CASHIER" },
      jar: managerJar,
    });
    assertEqual(response.status, 201, "manager -> cashier allowed");
    assert((response.body.code as string).length >= 12, "code returned");

    const managerTarget = uniqueEmail("mgrman");
    const denied = await api("/api/staff/invitations", {
      method: "POST",
      body: { email: managerTarget, role: "MANAGER" },
      jar: managerJar,
    });
    assertEqual(denied.status, 403, "manager -> manager forbidden");
  });

  await check("check validates code + email", async () => {
    const good = await api("/api/staff/invitations/check", {
      method: "POST",
      body: { code: invitationA!.code, email: invitationA!.email },
    });
    assertEqual(good.status, 200, "valid code accepted");
    assertEqual((good.body.invitation as { role?: string }).role, "MANAGER", "role returned");

    const wrongEmail = await api("/api/staff/invitations/check", {
      method: "POST",
      body: { code: invitationA!.code, email: uniqueEmail("other") },
    });
    assertEqual(wrongEmail.status, 422, "email mismatch rejected");

    const unknown = await api("/api/staff/invitations/check", {
      method: "POST",
      body: { code: "nx-no-such-code-123", email: directorName },
    });
    assertEqual(unknown.status, 404, "unknown code rejected");
  });

  const joinName = uniqueEmail("joincash");
  await check("accepting a cashier invitation signs in with COMPLETE", async () => {
    const create = await api("/api/staff/invitations", {
      method: "POST",
      body: { email: joinName, role: "CASHIER" },
      jar: superAdminJar,
    });
    const code = create.body.code as string;

    const jar: CookieJar = {};
    const response = await api("/api/staff/invitations/accept", {
      method: "POST",
      body: {
        code,
        email: joinName,
        name: "Join Cashier",
        password: PASSWORD,
        confirmPassword: PASSWORD,
      },
      jar,
    });
    assertEqual(response.status, 201, "accept status");
    assertEqual(response.body.step as string, "COMPLETE", "cashier gets a session now");
    assert(hasSession(jar), "session cookie present");
  });

  await check("a used code can never be used again", async () => {
    const replayEmail = uniqueEmail("replay");
    const create = await api("/api/staff/invitations", {
      method: "POST",
      body: { email: replayEmail, role: "CASHIER" },
      jar: superAdminJar,
    });
    const code = create.body.code as string;
    const first = await api("/api/staff/invitations/accept", {
      method: "POST",
      body: {
        code,
        email: replayEmail,
        name: "Replay Join",
        password: PASSWORD,
        confirmPassword: PASSWORD,
      },
    });
    assertEqual(first.status, 201, "first accept creates the account");

    const replay = await api("/api/staff/invitations/accept", {
      method: "POST",
      body: {
        code,
        email: replayEmail,
        name: "Replay Join",
        password: PASSWORD,
        confirmPassword: PASSWORD,
      },
    });
    assertEqual(replay.status, 409, "replay is rejected");
  });

  await check("accepting a manager invitation requires MFA setup", async () => {
    const managerTarget = uniqueEmail("joinmgr");
    const create = await api("/api/staff/invitations", {
      method: "POST",
      body: { email: managerTarget, role: "MANAGER" },
      jar: superAdminJar,
    });
    const code = create.body.code as string;

    const jar: CookieJar = {};
    const response = await api("/api/staff/invitations/accept", {
      method: "POST",
      body: {
        code,
        email: managerTarget,
        name: "Join Manager",
        password: PASSWORD,
        confirmPassword: PASSWORD,
      },
      jar,
    });
    assertEqual(response.status, 201, "accept status");
    assertEqual(response.body.step as string, "MFA_SETUP", "manager must set up MFA first");
    assert(!hasSession(jar), "no session until MFA is completed");
    assert(hasPending(jar), "pending MFA cookie present");

    const setup = await api("/api/staff/mfa/setup", { method: "POST", body: {}, jar });
    assertEqual(setup.status, 200, "MFA setup works after accepting");
    const ok = await verifyMfa(jar, setup.body.secret as string);
    assert(ok, "full session after MFA");
  });

  await check("join validation rejects weak passwords and mismatches", async () => {
    const target = uniqueEmail("weakjoin");
    const create = await api("/api/staff/invitations", {
      method: "POST",
      body: { email: target, role: "CASHIER" },
      jar: superAdminJar,
    });
    const code = create.body.code as string;

    const weak = await api("/api/staff/invitations/accept", {
      method: "POST",
      body: {
        code,
        email: target,
        name: "Weak Join",
        password: "short",
        confirmPassword: "short",
      },
    });
    assertEqual(weak.status, 400, "weak password rejected with 400");
    const weakField = weak.body.error as { fieldErrors?: Record<string, string[]> } | undefined;
    assert(Boolean(weakField?.fieldErrors?.password), "password field error surfaced");

    const mismatch = await api("/api/staff/invitations/accept", {
      method: "POST",
      body: {
        code,
        email: target,
        name: "Mismatch Join",
        password: PASSWORD,
        confirmPassword: "Different",
      },
    });
    assertEqual(mismatch.status, 400, "password mismatch rejected");
    const mismatchField = mismatch.body.error as { fieldErrors?: Record<string, string[]> } | undefined;
    assert(Boolean(mismatchField?.fieldErrors?.confirmPassword), "confirmPassword field error surfaced");
  });

  await check("expired invitations are reported and surfaced in the team view", async () => {
    const expiredEmail = uniqueEmail("expired");
    const expiredCode = `expired-${Date.now()}`;
    const source = await StaffInvitation.findById(invitationA!.invitationId).lean();
    await StaffInvitation.create({
      email: expiredEmail,
      role: "CASHIER",
      codeHash: sha256Hex(expiredCode),
      invitedBy: source?.invitedBy,
      expiresAt: new Date(Date.now() - 1000),
    });

    const checkResponse = await api("/api/staff/invitations/check", {
      method: "POST",
      body: { code: expiredCode, email: expiredEmail },
    });
    assertEqual(checkResponse.status, 410, "expired code -> 410");

    const team = await api("/api/staff/team", { jar: superAdminJar });
    const invitations = team.body.invitations as { email: string; status: string }[];
    const expiredRow = invitations.find((row) => row.email === expiredEmail);
    assert(Boolean(expiredRow), "expired invitation listed");
    assertEqual(expiredRow?.status, "EXPIRED", "derived status is EXPIRED");
  });

  await check("new staff password is bcrypt at rest (never plaintext)", async () => {
    const doc = await StaffProfile.findOne({ email: joinName }).select("+passwordHash");
    const hash = doc?.passwordHash ?? "";
    assert(hash.startsWith("$2"), "password stored as a bcrypt hash");
    assert(!hash.includes(PASSWORD), "plaintext password never stored");
  });
}

async function establishCashierSessionThroughInvite(superAdminJar: CookieJar): Promise<{
  email: string;
  jar: CookieJar;
  staffId: string;
}> {
  const email = uniqueEmail("teamcashier");
  const create = await api("/api/staff/invitations", {
    method: "POST",
    body: { email, role: "CASHIER" },
    jar: superAdminJar,
  });
  const code = create.body.code as string;
  const jar: CookieJar = {};
  await api("/api/staff/invitations/accept", {
    method: "POST",
    body: { code, email, name: "Team Cashier", password: PASSWORD, confirmPassword: PASSWORD },
    jar,
  });
  const member = await staffDoc(email);
  return { email, jar, staffId: String(member?._id) };
}

async function runTeamTests(superAdminJar: CookieJar): Promise<void> {
  console.log("\nTeam access");

  const cashier = await establishCashierSessionThroughInvite(superAdminJar);
  const managerJar = await establishManager();

  await check("team list returns staff + invitations to a manager", async () => {
    const response = await api("/api/staff/team", { jar: managerJar });
    assertEqual(response.status, 200, "team list status");
    assert(Array.isArray(response.body.staff), "staff array returned");
    assert(Array.isArray(response.body.invitations), "invitations array returned");
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

  await check("re-activating restores access", async () => {
    const response = await api(`/api/staff/team/${cashier.staffId}`, {
      method: "PATCH",
      body: { staffId: cashier.staffId, isActive: true },
      jar: superAdminJar,
    });
    assertEqual(response.status, 200, "activate status");
    const me = await api("/api/staff/me", { jar: cashier.jar });
    assertEqual(me.status, 200, "session works again after activation");
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

  await check("promoted cashier must re-authenticate (old session never grants the portal)", async () => {
    const portal = await fetch(`${BASE_URL}/pos`, {
      headers: { Cookie: cookieHeader(cashier.jar) },
      redirect: "manual",
    });
    const location = portal.headers.get("location") ?? "";
    assert(location.includes("/pos/login"), `portal redirects to sign-in, got ${location}`);

    const legacyHandoff = await fetch(`${BASE_URL}/pos/activate-mfa`, {
      headers: { Cookie: cookieHeader(cashier.jar) },
      redirect: "manual",
    });
    assertEqual(legacyHandoff.status, 404, "the legacy MFA hand-off route no longer exists");
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
    const freshCashier = await establishCashierSessionThroughInvite(superAdminJar);
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

  const jar = (await fullSignIn(email, "COMPLETE")).jar;

  await check("/api/staff/me returns the signed-in profile", async () => {
    const response = await api("/api/staff/me", { jar });
    assertEqual(response.status, 200, "me status");
    assertEqual((response.body.staff as { email: string }).email, email, "email matches");
    assertEqual((response.body.staff as { role: string }).role, "CASHIER", "role matches");
    const member = response.body.staff as Record<string, unknown>;
    assert(
      !("passwordHash" in member) && !("mfaSecretEncrypted" in member),
      "me never leaks hashes or MFA secrets",
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
    assert(location.includes("/pos/login"), `redirects to login, got ${location}`);
  });

  await check("/pos/team redirects anonymous visitors to sign in", async () => {
    const response = await fetch(`${BASE_URL}/pos/team`, { redirect: "manual" });
    const location = response.headers.get("location") ?? "";
    assert(location.includes("/pos/login"), `redirects to login, got ${location}`);
  });

  await check("the login page renders", async () => {
    const response = await fetch(`${BASE_URL}/pos/login`, { redirect: "manual" });
    assertEqual(response.status, 200, "login page status");
    const html = await response.text();
    assert(/sign in/i.test(html), "login form present");
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
  const cashier = await fullSignIn(cashierEmail, "COMPLETE");

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
    const response = await fetch(`${BASE_URL}/pos/login`, { redirect: "manual" });
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

    const [deletedSessions, deletedInvites, deletedAudit, deletedStaff] = await Promise.all([
      StaffSession.deleteMany({ staffId: { $in: ids } }),
      StaffInvitation.deleteMany({
        $or: [{ invitedBy: { $in: ids } }, { email: { $in: createdStaffEmails } }],
      }),
      AuditLog.deleteMany({
        $or: [{ actorStaffId: { $in: ids } }, { targetStaffId: { $in: ids } }],
      }),
      StaffProfile.deleteMany({ email: { $in: createdStaffEmails } }),
    ]);

    console.log(
      `[cleanup] removed ${deletedStaff.deletedCount} staff, ${deletedSessions.deletedCount} sessions, ${deletedInvites.deletedCount} invitations, ${deletedAudit.deletedCount} audit entries`,
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
    await runMfaTests();
    await runInvitationTests(superAdminJar);
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