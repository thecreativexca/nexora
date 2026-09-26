import "server-only";

import { Types } from "mongoose";

import { AUDIT_ACTION } from "@/lib/constants/audit";
import { connectDB } from "@/lib/db/mongodb";
import { decryptSecret, encryptSecret } from "@/lib/security/encryption";
import {
  buildOtpauthUri,
  generateSecret,
  verifyTotpCode,
} from "@/lib/security/totp";
import { recordAudit } from "@/lib/services/audit.service";
import { toDatabaseError } from "@/lib/services/service-errors";
import {
  MfaSetupRequiredError,
  NotFoundError,
  StaffManagementFailedError,
  isAppError,
} from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";
import { StaffProfile } from "@/models/StaffProfile";

/**
 * TOTP MFA for the staff portal.
 *
 * - The seed is generated server-side and only ever stored encrypted
 *   (AES-256-GCM). Plaintext seeds exist only in memory during setup/verify.
 * - `stageMfaSecret` prepares (never activates) a new seed; the flow only
 *   switches to `mfaEnabled` after a valid one-time code proves the invitee
 *   holds the seed in their authenticator app.
 * - Failed verification never reveals the seed and throws a generic error.
 */

interface LeanStaffForMfa {
  _id: Types.ObjectId;
  email: string;
  mfaEnabled: boolean;
  mfaSecretEncrypted?: string | null;
}

async function getStaffForMfa(staffId: string): Promise<LeanStaffForMfa | null> {
  if (!Types.ObjectId.isValid(staffId)) return null;
  try {
    await connectDB();
  } catch (error) {
    throw toDatabaseError(error);
  }
  try {
    return await StaffProfile.findById(staffId)
      .select("+mfaSecretEncrypted email mfaEnabled")
      .lean<LeanStaffForMfa | null>();
  } catch (error) {
    throw toDatabaseError(error);
  }
}

/**
 * Generates a fresh seed, encrypts it at rest and returns the (short-lived)
 * plaintext secret + QR-ready otpauth URI. Safe to call again to re-issue.
 */
export async function stageMfaSecret(
  staffId: string,
): Promise<{ secret: string; otpauthUri: string }> {
  const staff = await getStaffForMfa(staffId);
  if (!staff) throw new NotFoundError("Staff member not found.");
  if (staff.mfaEnabled) {
    throw new MfaSetupRequiredError("Two-step verification is already set up.");
  }

  const secret = generateSecret();
  let encrypted: string;
  try {
    encrypted = encryptSecret(secret);
  } catch (error) {
    logger.error("Encrypting MFA secret failed", error);
    throw new StaffManagementFailedError(undefined, error);
  }

  try {
    await StaffProfile.findByIdAndUpdate(staff._id, {
      $set: { mfaSecretEncrypted: encrypted, mfaEnabled: false },
    });
  } catch (error) {
    logger.error("Persisting staged MFA secret failed", error);
    throw new StaffManagementFailedError(undefined, error);
  }

  return { secret, otpauthUri: buildOtpauthUri(secret, staff.email) };
}

/**
 * Checks a one-time code against the currently staged secret WITHOUT enabling
 * MFA. Returns true on success only.
 */
export async function verifyPendingMfa(staffId: string, code: string): Promise<boolean> {
  const staff = await getStaffForMfa(staffId);
  if (!staff) throw new NotFoundError("Staff member not found.");
  if (!staff.mfaSecretEncrypted) {
    throw new MfaSetupRequiredError("Begin with the two-step setup first.");
  }

  let secret: string;
  try {
    secret = decryptSecret(staff.mfaSecretEncrypted);
  } catch {
    // Corrupt or tampered payload - fail closed, never surface a stack trace.
    throw new MfaSetupRequiredError("Two-step verification needs to be set up again.");
  }

  if (!verifyTotpCode(secret, code)) {
    return false;
  }

  return true;
}

/**
 * Marks MFA as fully enabled (setup completion) or confirms a still-valid
 * enrolment as freshly verified. Used only after `verifyPendingMfa` returned
 * true. Resets the login failure counters for good measure.
 */
export async function enableMfa(staffId: string): Promise<void> {
  try {
    await connectDB();
  } catch (error) {
    throw toDatabaseError(error);
  }
  try {
    await StaffProfile.findByIdAndUpdate(staffId, {
      $set: {
        mfaEnabled: true,
        mfaVerifiedAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
  } catch (error) {
    if (isAppError(error)) throw error;
    logger.error("Enabling MFA failed", error);
    throw new StaffManagementFailedError(undefined, error);
  }

  recordAudit({
    actorStaffId: staffId,
    action: AUDIT_ACTION.STAFF_MFA_ENABLED,
    targetStaffId: staffId,
  });
}