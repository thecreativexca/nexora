import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/mongodb"; import { AccountDisabledError, InvalidRequestError } from "@/lib/utils/errors";
import { normalizeEmail } from "@/lib/validations/common"; import { Customer } from "@/models/Customer"; import { OAuthAccount } from "@/models/OAuthAccount";
export type OAuthProvider = "google";
interface StatePayload { provider: OAuthProvider; state: string; verifier: string; next: string; expires: number; }
function secret() { const value = process.env.AUTH_SECRET?.trim(); if (!value || value.length < 32) throw new Error("AUTH_SECRET must be at least 32 characters."); return value; }
function encode(value: object) { const payload = Buffer.from(JSON.stringify(value)).toString("base64url"); const sig = createHmac("sha256", secret()).update(payload).digest("base64url"); return `${payload}.${sig}`; }
export function decodeOAuthState(value: string): StatePayload { const [payload, signature] = value.split("."); if (!payload || !signature) throw new InvalidRequestError("OAuth state is invalid."); const expected = createHmac("sha256", secret()).update(payload).digest(); const supplied = Buffer.from(signature, "base64url"); if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw new InvalidRequestError("OAuth state is invalid."); const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as StatePayload; if (parsed.expires < Date.now()) throw new InvalidRequestError("OAuth state expired."); return parsed; }
function appUrl() { const value = process.env.NEXT_PUBLIC_APP_URL?.trim(); if (!value) throw new Error("NEXT_PUBLIC_APP_URL is required for OAuth."); return value.replace(/\/$/, ""); }
function credentials() { const clientId = process.env.GOOGLE_CLIENT_ID?.trim(); const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim(); if (!clientId || !clientSecret) throw new Error("GOOGLE OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET."); return { clientId, clientSecret }; }
/** True when both Google OAuth credentials are present (values are never exposed). */
export function isGoogleOAuthConfigured(): boolean { return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim()); }
/** Exact callback URI that must be registered in the Google Cloud console. */
export function googleOAuthRedirectUri(): string { return `${appUrl()}/api/account/oauth/google/callback`; }
export function createOAuthAuthorization(provider: OAuthProvider, next: string) {
  const { clientId } = credentials(); const state = randomBytes(24).toString("base64url"); const verifier = randomBytes(48).toString("base64url"); const redirectUri = `${appUrl()}/api/account/oauth/${provider}/callback`;
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", state, scope: "openid email profile" });
  params.set("code_challenge", createHash("sha256").update(verifier).digest("base64url")); params.set("code_challenge_method", "S256"); params.set("prompt", "select_account");
  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`, cookie: encode({ provider, state, verifier, next, expires: Date.now() + 10 * 60 * 1000 } satisfies StatePayload) };
}
export async function fetchOAuthIdentity(provider: OAuthProvider, code: string, verifier: string) {
  const { clientId, clientSecret } = credentials(); const redirectUri = `${appUrl()}/api/account/oauth/${provider}/callback`;
  const tokenUrl = "https://oauth2.googleapis.com/token";
  const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, code, grant_type: "authorization_code" }); body.set("code_verifier", verifier);
  const tokenResponse = await fetch(tokenUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, cache: "no-store" }); if (!tokenResponse.ok) throw new InvalidRequestError("The social sign-in could not be completed.");
  const token = await tokenResponse.json() as { access_token?: string }; if (!token.access_token) throw new InvalidRequestError("The social provider did not return a valid login.");
  const profileUrl = "https://openidconnect.googleapis.com/v1/userinfo";
  const profileResponse = await fetch(profileUrl, { headers: { Authorization: `Bearer ${token.access_token}` }, cache: "no-store" }); if (!profileResponse.ok) throw new InvalidRequestError("The social profile could not be loaded.");
  const profile = await profileResponse.json() as { sub?: string; email?: string; email_verified?: boolean; name?: string };
  const providerAccountId = profile.sub; if (!providerAccountId || !profile.email) throw new InvalidRequestError("Your provider account must share an email address.");
  if (profile.email_verified !== true) throw new InvalidRequestError("Your Google email must be verified.");
  return { providerAccountId, email: normalizeEmail(profile.email), name: profile.name?.trim() || "Nexora customer", emailVerified: true };
}
export async function resolveOAuthCustomer(provider: OAuthProvider, identity: Awaited<ReturnType<typeof fetchOAuthIdentity>>) {
  await connectDB(); const linked = await OAuthAccount.findOne({ provider, providerAccountId: identity.providerAccountId }).lean<{ customerId: Types.ObjectId } | null>();
  if (linked) { const customer = await Customer.findById(linked.customerId).select("isActive").lean<{ _id: Types.ObjectId; isActive?: boolean } | null>(); if (!customer || customer.isActive === false) throw new AccountDisabledError(); return String(customer._id); }
  let customer = await Customer.findOne({ email: identity.email }).select("isActive").lean<{ _id: Types.ObjectId; isActive?: boolean } | null>();
  if (customer?.isActive === false) throw new AccountDisabledError();
  if (!customer) { const created = await Customer.create({ email: identity.email, name: identity.name, phone: "", address: null, isActive: true, lastLoginAt: new Date() }); customer = { _id: created._id, isActive: true }; }
  await OAuthAccount.create({ customerId: customer._id, provider, providerAccountId: identity.providerAccountId }); await Customer.updateOne({ _id: customer._id }, { $set: { lastLoginAt: new Date() } }); return String(customer._id);
}
