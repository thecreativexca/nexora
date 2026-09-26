import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { Types } from "mongoose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import {
  CUSTOMER_SESSION_COOKIE,
  CUSTOMER_SESSION_TTL_MS,
} from "@/lib/constants/customer";
import { connectDB } from "@/lib/db/mongodb";
import { getCustomerById } from "@/lib/services/customer.service";
import { logger } from "@/lib/utils/logger";
import { CustomerSession } from "@/models/CustomerSession";
import type { CustomerView } from "@/types/customer";

/**
 * Customer session management (server-only).
 *
 * Strategy: opaque random token in an HttpOnly cookie + SHA-256 hash stored in
 * MongoDB. The raw token is never persisted, never logged and never exposed to
 * client JavaScript. Logout deletes the database row so a copied cookie becomes
 * useless immediately.
 */

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function cookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  };
}

/** Creates a fresh session and sets the auth cookie. Server Action / Route Handler only. */
export async function createCustomerSession(customerId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + CUSTOMER_SESSION_TTL_MS);

  await connectDB();
  await CustomerSession.create({
    customerId: new Types.ObjectId(customerId),
    tokenHash: hashToken(token),
    expiresAt,
  });

  const cookieStore = await cookies();
  cookieStore.set(CUSTOMER_SESSION_COOKIE, token, cookieOptions(expiresAt));
}

/** Revokes the current session both server-side and in the browser. */
export async function destroyCustomerSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(CUSTOMER_SESSION_COOKIE)?.value;

  if (token) {
    try {
      await connectDB();
      await CustomerSession.deleteOne({ tokenHash: hashToken(token) });
    } catch (error) {
      // Clearing the cookie is enough to sign the user out locally; never block
      // logout because the database was briefly unreachable.
      logger.error("Failed to revoke customer session", error);
    }
  }

  cookieStore.delete(CUSTOMER_SESSION_COOKIE);
}

async function loadCurrentCustomer(): Promise<CustomerView | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(CUSTOMER_SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    await connectDB();
    const session = await CustomerSession.findOne({
      tokenHash: hashToken(token),
      expiresAt: { $gt: new Date() },
    }).lean<{ customerId: Types.ObjectId } | null>();

    if (!session) return null;

    const customer = await getCustomerById(String(session.customerId));
    if (!customer || !customer.isActive) return null;
    return customer;
  } catch (error) {
    logger.error("Failed to resolve customer session", error);
    return null;
  }
}

/** Request-scoped memoisation so a render pass only resolves the session once. */
export const getCurrentCustomer = cache(loadCurrentCustomer);

/**
 * Server-side guard for protected pages. Redirects unauthenticated visitors to
 * the login screen (with a safe return path), never merely relying on client UI.
 */
export async function requireCustomer(nextPath?: string): Promise<CustomerView> {
  const customer = await getCurrentCustomer();
  if (!customer) {
    const safeNext = nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")
      ? nextPath
      : "/account";
    redirect(`/account/login?next=${encodeURIComponent(safeNext)}`);
  }
  return customer;
}

/** Resolves the authenticated customer's id, or null for guests (checkout). */
export async function getCurrentCustomerId(): Promise<string | null> {
  const customer = await getCurrentCustomer();
  return customer?.id ?? null;
}
