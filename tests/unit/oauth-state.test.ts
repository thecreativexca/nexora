/**
 * Unit tests for the Google OAuth state/PKCE helpers.
 *
 * Run with: npm run test:oauth
 */
import { createHash } from "node:crypto";

import {
  createOAuthAuthorization,
  decodeOAuthState,
  googleOAuthRedirectUri,
  isGoogleOAuthConfigured,
} from "@/lib/auth/customer-oauth";

process.env.AUTH_SECRET = "oauth-unit-test-secret-0123456789abcdef";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
process.env.GOOGLE_CLIENT_ID = "test-client.apps.googleusercontent.com";
process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";

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

function assertThrows(fn: () => void, label: string): void {
  try {
    fn();
  } catch {
    return;
  }
  throw new Error(`${label}: expected an error`);
}

check("Google credentials are detected", () => {
  assertTrue(isGoogleOAuthConfigured(), "isGoogleOAuthConfigured");
});

check("redirect URI matches the callback route", () => {
  assertEqual(
    googleOAuthRedirectUri(),
    "http://localhost:3000/api/account/oauth/google/callback",
    "redirect URI",
  );
});

const auth = createOAuthAuthorization("google", "/account/orders");

check("authorization URL targets Google with PKCE", () => {
  const url = new URL(auth.url);
  assertEqual(url.origin, "https://accounts.google.com", "origin");
  assertEqual(url.pathname, "/o/oauth2/v2/auth", "path");
  assertEqual(url.searchParams.get("client_id"), "test-client.apps.googleusercontent.com", "client_id");
  assertEqual(url.searchParams.get("response_type"), "code", "response_type");
  assertEqual(url.searchParams.get("scope"), "openid email profile", "scope");
  assertEqual(url.searchParams.get("code_challenge_method"), "S256", "code_challenge_method");
  assertEqual(url.searchParams.get("prompt"), "select_account", "prompt");
  assertEqual(
    url.searchParams.get("redirect_uri"),
    "http://localhost:3000/api/account/oauth/google/callback",
    "redirect_uri",
  );
});

const state = decodeOAuthState(auth.cookie);

check("signed state round-trips the return path and verifier", () => {
  assertEqual(state.provider, "google", "provider");
  assertEqual(state.next, "/account/orders", "next");
  assertEqual(state.state, new URL(auth.url).searchParams.get("state"), "state");
  assertTrue(state.expires > Date.now(), "expiry is in the future");
});

check("PKCE challenge is the S256 hash of the verifier", () => {
  const challenge = createHash("sha256").update(state.verifier).digest("base64url");
  assertEqual(new URL(auth.url).searchParams.get("code_challenge"), challenge, "code_challenge");
});

check("tampered state signature is rejected", () => {
  const [payload, signature] = auth.cookie.split(".");
  const flipped = `${signature[0] === "a" ? "b" : "a"}${signature.slice(1)}`;
  assertThrows(() => decodeOAuthState(`${payload}.${flipped}`), "tampered signature");
});

check("unsigned state is rejected", () => {
  assertThrows(() => decodeOAuthState("not-a-real-state"), "unsigned state");
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.error(`Failed: ${failures.join(", ")}`);
  process.exitCode = 1;
}
