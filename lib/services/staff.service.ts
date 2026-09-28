import "server-only";

import { Types } from "mongoose";

import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  AUDIT_ACTION,
} from "@/lib/constants/audit";
import {
  INVALID_STAFF_CREDENTIALS_MESSAGE,
  LOGIN_LOCKOUT_MS,
  MAX_LOGIN_FAILURES,
  STAFF_ROLE,
  staffCanChangeRole,
  staffCanManageActive,
  staffRoleRequiresMfa,
  type StaffRole,
} from "@/lib/constants/staff";
import { connectDB } from "@/lib/db/mongodb";
import { recordAudit } from "@/lib/services/audit.service";
import { toDatabaseError } from "@/lib/services/service-errors";
import {
  ForbiddenError,
  InvalidCredentialsError,
  NotFoundError,
  StaffManagementFailedError,
  isAppError,
  isDuplicateKeyError,
} from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";
import { normalizeEmail } from "@/lib/validations/common";
import { StaffProfile } from "@/models/StaffProfile";
import type {
  StaffAuthResult,
  StaffView,
} from "@/types/staff";

/** Lean read-only views produced by `.lean()` queries. */
export interface LeanStaff {
  _id: Types.ObjectId;
  email: string;
  name: string;
  role: StaffRole;
  isActive: boolean;
  mfaEnabled: boolean;
  mfaVerifiedAt?: Date | null;
  lastLoginAt?: Date | null;
  invitedBy?: Types.ObjectId | null;
  createdAt: Date;
}

export interface LeanStaffWithHash extends LeanStaff {
  passwordHash?: string;
  mfaSecretEncrypted?: string | null;
  failedLoginCount?: number;
  lockedUntil?: Date | null;
}

/** Constant-time equaliser: unknown emails still pay a bcrypt compare. */
const DUMMY_PASSWORD_HASH =
  "$2b$12$JFAtFC9MTe8KLvoqhIOomub2ZF4/H12ZF9nW6D3N0xrBKG910lTcG";

async function ensureDatabase(): Promise<void> {
  try {
    await connectDB();
  } catch (error) {
    throw toDatabaseError(error);
  }
}

/** Only ever returns fields that are safe to send to the browser. */
export function toStaffView(staff: LeanStaff): StaffView {
  return {
    id: String(staff._id),
    email: staff.email,
    name: staff.name,
    role: staff.role,
    isActive: staff.isActive,
    mfaEnabled: staff.mfaEnabled,
    mfaVerifiedAt: staff.mfaVerifiedAt
      ? new Date(staff.mfaVerifiedAt).toISOString()
      : null,
    lastLoginAt: staff.lastLoginAt
      ? new Date(staff.lastLoginAt).toISOString()
      : null,
    invitedBy: staff.invitedBy ? String(staff.invitedBy) : null,
    createdAt: new Date(staff.createdAt).toISOString(),
  };
}

export async function getStaffProfileById(id: string): Promise<LeanStaff | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  await ensureDatabase();
  try {
    return await StaffProfile.findById(id).lean<LeanStaff | null>();
  } catch (error) {
    throw toDatabaseError(error);
  }
}

export async function getStaffViewById(id: string): Promise<StaffView | null> {
  const staff = await getStaffProfileById(id);
  return staff ? toStaffView(staff) : null;
}

function toAuthResult(staff: LeanStaff): StaffAuthResult {
  const view = toStaffView(staff);
  if (!staffRoleRequiresMfa(staff.role)) {
    return { staff: view, nextStep: "COMPLETE" };
  }
  // Two-step sign-in is email-OTP based: every login for Manager / Super-Admin
  // goes through a fresh code, so there is no enrolment step.
  return { staff: view, nextStep: "MFA_VERIFY" };
}

/**
 * Verifies staff credentials.
 *
 * Security rules:
 * - A single generic message covers wrong password, unknown email, disabled
 *   account and temporarily-locked account (no user enumeration).
 * - Unknown emails pay a real bcrypt compare so timing does not reveal whether
 *   an email exists.
 * - Consecutive failures increment a per-account counter; hitting
 *   `MAX_LOGIN_FAILURES` locks the account for `LOGIN_LOCKOUT_MS`.
 */
export async function authenticateStaff(
  emailInput: string,
  password: string,
): Promise<StaffAuthResult> {
  await ensureDatabase();

  const email = normalizeEmail(emailInput);

  let staff: LeanStaffWithHash | null;
  try {
    staff = await StaffProfile.findOne({ email })
      .select("+passwordHash")
      .lean<LeanStaffWithHash | null>();
  } catch (error) {
    throw toDatabaseError(error);
  }

  if (!staff) {
    await verifyPassword(password, DUMMY_PASSWORD_HASH);
    throw new InvalidCredentialsError(INVALID_STAFF_CREDENTIALS_MESSAGE);
  }

  const passwordMatches = await verifyPassword(password, staff.passwordHash ?? "");
  if (!passwordMatches) {
    await recordStaffLoginFailure(staff);
    throw new InvalidCredentialsError(INVALID_STAFF_CREDENTIALS_MESSAGE);
  }

  const locked = staff.lockedUntil && new Date(staff.lockedUntil) > new Date();
  if (locked || staff.isActive === false) {
    throw new InvalidCredentialsError(INVALID_STAFF_CREDENTIALS_MESSAGE);
  }

  try {
    await StaffProfile.findByIdAndUpdate(staff._id, {
      $set: {
        lastLoginAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
  } catch (error) {
    logger.error("Staff login success-side update failed", error);
  }

  recordAudit({
    actorStaffId: String(staff._id),
    action: AUDIT_ACTION.STAFF_LOGIN_SUCCESS,
    targetStaffId: String(staff._id),
  });

  return toAuthResult(staff);
}

async function recordStaffLoginFailure(staff: LeanStaffWithHash): Promise<void> {
  try {
    const failedLoginCount = (staff.failedLoginCount ?? 0) + 1;
    const locked = failedLoginCount >= MAX_LOGIN_FAILURES;
    await StaffProfile.findByIdAndUpdate(staff._id, {
      $set: {
        failedLoginCount: locked ? 0 : failedLoginCount,
        lockedUntil: locked ? new Date(Date.now() + LOGIN_LOCKOUT_MS) : null,
      },
    });
  } catch (error) {
    logger.error("Recording staff login failure failed", error);
  }

  recordAudit({
    actorStaffId: String(staff._id),
    action: AUDIT_ACTION.STAFF_LOGIN_FAILURE,
    targetStaffId: String(staff._id),
  });
}

/** Creates (or resets) the Super-Admin. Used by the CLI script only. */
export async function bootstrapSuperAdmin(input: {
  name: string;
  email: string;
  password: string;
}): Promise<StaffView> {
  await ensureDatabase();

  const email = normalizeEmail(input.email);
  const passwordHash = await hashPassword(input.password);
  const now = new Date();

  try {
    const updated = await StaffProfile.findOneAndUpdate(
      { email },
      {
        $set: {
          name: input.name.trim(),
          passwordHash,
          role: STAFF_ROLE.SUPER_ADMIN,
          isActive: true,
          mfaEnabled: false,
          mfaSecretEncrypted: null,
          mfaVerifiedAt: null,
          passwordChangedAt: now,
          failedLoginCount: 0,
          lockedUntil: null,
        },
      },
      { upsert: true, returnDocument: "after", runValidators: true },
    ).lean<LeanStaff | null>();

    if (!updated) throw new StaffManagementFailedError();

    recordAudit({
      actorStaffId: String(updated._id),
      action: AUDIT_ACTION.SUPER_ADMIN_BOOTSTRAPPED,
      targetStaffId: String(updated._id),
    });

    logger.info("Super-Admin bootstrapped", { staffId: String(updated._id) });
    return toStaffView(updated);
  } catch (error) {
    if (isAppError(error)) throw error;
    if (isDuplicateKeyError(error)) throw new StaffManagementFailedError(undefined, error);
    logger.error("Super-Admin bootstrap failed", error);
    throw new StaffManagementFailedError(undefined, error);
  }
}

/** All staff, newest first. Never includes hashes or MFA secrets. */
export async function listStaff(): Promise<StaffView[]> {
  await ensureDatabase();
  try {
    const staff = await StaffProfile.find()
      .sort({ role: 1, createdAt: -1 })
      .lean<LeanStaff[]>();
    return staff.map(toStaffView);
  } catch (error) {
    throw toDatabaseError(error);
  }
}

/** Re-usable helpers for Team Access mutations (activate/deactivate/role). */
export async function loadStaffForManagement(
  actor: StaffView,
  targetId: string,
): Promise<{ actorRole: StaffRole; target: LeanStaff }> {
  if (!Types.ObjectId.isValid(targetId)) {
    throw new NotFoundError("Staff member not found.");
  }
  await ensureDatabase();
  let target: LeanStaff | null;
  try {
    target = await StaffProfile.findById(targetId).lean<LeanStaff | null>();
  } catch (error) {
    throw toDatabaseError(error);
  }
  if (!target) throw new NotFoundError("Staff member not found.");
  return { actorRole: actor.role, target };
}

export async function setStaffActive(
  actor: StaffView,
  targetId: string,
  isActive: boolean,
): Promise<StaffView> {
  const { target } = await loadStaffForManagement(actor, targetId);

  if (
    !staffCanManageActive(actor.role, actor.id, target.role, String(target._id))
  ) {
    throw new ForbiddenError("You are not allowed to change this account's access.");
  }

  try {
    const updated = await StaffProfile.findByIdAndUpdate(
      target._id,
      { $set: { isActive } },
      { returnDocument: "after", runValidators: true },
    ).lean<LeanStaff | null>();
    if (!updated) throw new StaffManagementFailedError();

    recordAudit({
      actorStaffId: actor.id,
      action: isActive ? AUDIT_ACTION.STAFF_ACTIVATED : AUDIT_ACTION.STAFF_DEACTIVATED,
      targetStaffId: String(target._id),
    });

    return toStaffView(updated);
  } catch (error) {
    if (isAppError(error)) throw error;
    logger.error("Staff active toggle failed", error);
    throw new StaffManagementFailedError(undefined, error);
  }
}

export async function changeStaffRole(
  actor: StaffView,
  targetId: string,
  newRole: StaffRole,
): Promise<StaffView> {
  const { target } = await loadStaffForManagement(actor, targetId);

  if (
    !staffCanChangeRole(
      actor.role,
      actor.id,
      target.role,
      String(target._id),
      newRole,
    )
  ) {
    throw new ForbiddenError("You are not allowed to change this account's role.");
  }

  try {
    const updated = await StaffProfile.findByIdAndUpdate(
      target._id,
      { $set: { role: newRole } },
      { returnDocument: "after", runValidators: true },
    ).lean<LeanStaff | null>();
    if (!updated) throw new StaffManagementFailedError();

    recordAudit({
      actorStaffId: actor.id,
      action: AUDIT_ACTION.STAFF_ROLE_CHANGED,
      targetStaffId: String(target._id),
      metadata: { from: target.role, to: newRole },
    });

    return toStaffView(updated);
  } catch (error) {
    if (isAppError(error)) throw error;
    logger.error("Staff role change failed", error);
    throw new StaffManagementFailedError(undefined, error);
  }
}