import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { Types } from "mongoose";
import { cookies } from "next/headers";

import {
  STAFF_MFA_PENDING_COOKIE,
  STAFF_MFA_PENDING_TTL_MS,
} from "@/lib/constants/staff";

/**
 * Short-lived pre-authentication state used while a Manager / Super-Admin
 * completes mandatory MFA.
 *
 * The cookie stores `staffId.expiresAt.hmac` where the HMAC is computed over
 * `staffId.expiresAt` with a server-only secret. It never grants portal access
 * by itself - it only authorises the MFA setup/verify endpoints - so navigating
 * straight to /pos without MFA cannot be used to bypass the check.
 */

function getSecret(): string {
  const secret = process.env.STAFF_SESSION_SECRET;
  if (!secret || secret.trim().length === 0) {
    throw new Error(
      "STAFF_SESSION_SECRET is not set. Copy .env.example to .env.local and set it before using the staff portal.",
    );
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

/** Records that `staffId` passed the password step and now needs MFA. */
export async function createMfaPendingCookie(staffId: string): Promise<void> {
  const expiresAt = Date.now() + STAFF_MFA_PENDING_TTL_MS;
  const payload = `${staffId}.${expiresAt}`;
  const value = `${payload}.${sign(payload)}`;

  const cookieStore = await cookies();
  cookieStore.set(STAFF_MFA_PENDING_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(expiresAt),
    path: "/",
  });
}

/** Returns the staffId recorded in a valid, unexpired pending cookie. */
export async function getPendingStaffId(): Promise<string | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(STAFF_MFA_PENDING_COOKIE)?.value;
  if (!value) return null;

  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [staffId, expiresAtRaw, signature] = parts;
  const payload = `${staffId}.${expiresAtRaw}`;

  const expected = sign(payload);
  if (!safeEqual(expected, signature)) return null;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
  if (!Types.ObjectId.isValid(staffId)) return null;

  return staffId;
}

export async function destroyMfaPendingCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(STAFF_MFA_PENDING_COOKIE);
}