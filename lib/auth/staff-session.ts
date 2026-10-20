import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { Types } from "mongoose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import {
  STAFF_SESSION_COOKIE,
  STAFF_SESSION_TTL_MS,
  staffHasPermission,
  type StaffPermission,
} from "@/lib/constants/staff";
import { connectDB } from "@/lib/db/mongodb";
import {
  getStaffProfileById,
  toStaffView,
} from "@/lib/services/staff.service";
import { ForbiddenError, UnauthenticatedError } from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";
import { StaffSession } from "@/models/StaffSession";
import type { StaffView } from "@/types/staff";

/**
 * Staff session management (server-only).
 *
 * Split from the customer session system on purpose: staff and customers are
 * different security domains and never share cookies or identity.
 *
 * Strategy: opaque random token in an HttpOnly cookie + SHA-256 hash stored in
 * MongoDB. A session is created immediately after password authentication.
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

/** Creates a fresh staff session and sets the auth cookie. */
export async function createStaffSession(
  staffId: string,
  ttlMs: number = STAFF_SESSION_TTL_MS,
): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ttlMs);

  await connectDB();
  await StaffSession.create({
    staffId: new Types.ObjectId(staffId),
    tokenHash: hashToken(token),
    expiresAt,
  });

  const cookieStore = await cookies();
  cookieStore.set(STAFF_SESSION_COOKIE, token, cookieOptions(expiresAt));
}

/** Revokes the current session server-side and clears the cookie. */
export async function destroyStaffSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(STAFF_SESSION_COOKIE)?.value;

  if (token) {
    try {
      await connectDB();
      await StaffSession.deleteOne({ tokenHash: hashToken(token) });
    } catch (error) {
      logger.error("Failed to revoke staff session", error);
    }
  }

  cookieStore.delete(STAFF_SESSION_COOKIE);
}

/**
 * Resolves the fully authenticated staff member. NULL if there is no session,
 * the session expired, the staff record vanished, or the staff member has been
 * deactivated - so disabled accounts lose portal access on their very next
 * request (fresh database check, never a stale cookie value).
 */
async function loadCurrentStaff(): Promise<StaffView | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(STAFF_SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    await connectDB();
    const session = await StaffSession.findOne({
      tokenHash: hashToken(token),
      expiresAt: { $gt: new Date() },
    }).lean<{ staffId: Types.ObjectId } | null>();

    if (!session) return null;

    const staff = await getStaffProfileById(String(session.staffId));
    if (!staff || !staff.isActive) return null;
    return toStaffView(staff);
  } catch (error) {
    logger.error("Failed to resolve staff session", error);
    return null;
  }
}

/** Request-scoped memoisation so a render pass only resolves the session once. */
export const getCurrentStaff = cache(loadCurrentStaff);

/** Server-side gate for protected portal pages. Uses the unified login. */
export async function requireStaff(): Promise<StaffView> {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/account/login?next=%2Fpos");
  return staff;
}

/** Page-level permission gate. Unauthorised users land on their dashboard. */
export async function requirePermission(permission: StaffPermission): Promise<StaffView> {
  const staff = await requireStaff();
  const allowed = staff.effectivePermissions
    ? staff.effectivePermissions.includes(permission)
    : staffHasPermission(staff.role, permission);
  if (!allowed) redirect("/pos");
  return staff;
}

/** API variant - throws instead of redirecting so handlers return JSON. */
export async function requireStaffApi(): Promise<StaffView> {
  const staff = await getCurrentStaff();
  if (!staff) throw new UnauthenticatedError();
  return staff;
}

export async function requirePermissionApi(
  permission: StaffPermission,
): Promise<StaffView> {
  const staff = await requireStaffApi();
  const allowed = staff.effectivePermissions
    ? staff.effectivePermissions.includes(permission)
    : staffHasPermission(staff.role, permission);
  if (!allowed) throw new ForbiddenError();
  return staff;
}
