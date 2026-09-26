import type { NextRequest } from "next/server";

import { destroyMfaPendingCookie, getPendingStaffId } from "@/lib/auth/mfa-pending";
import { createStaffSession } from "@/lib/auth/staff-session";
import { AUDIT_ACTION } from "@/lib/constants/audit";
import { STAFF_SESSION_TTL_MS, staffRoleRequiresMfa } from "@/lib/constants/staff";
import { clientKey, staffMfaVerifyLimiter } from "@/lib/security/rate-limit";
import { recordAudit } from "@/lib/services/audit.service";
import { enableMfa, verifyPendingMfa } from "@/lib/services/mfa.service";
import { getStaffViewById } from "@/lib/services/staff.service";
import {
  ForbiddenError,
  MfaInvalidError,
  MfaSetupRequiredError,
  TooManyRequestsError,
  UnauthenticatedError,
  validationError,
} from "@/lib/utils/errors";
import { readJsonBody, toErrorResponse, toSuccessResponse } from "@/lib/utils/http";
import { mfaVerifySchema } from "@/lib/validations/staff";

/**
 * Completes MFA: only after a valid one-time code does the staff member
 * receive a real portal session. Invalid codes are throttled and audited.
 */
export async function POST(request: NextRequest) {
  const parsedBody = await readJsonBody(request, "POST /api/staff/mfa/verify invalid JSON");
  if ("error" in parsedBody) return parsedBody.error;

  const parsed = mfaVerifySchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return toErrorResponse(validationError(parsed.error), "POST /api/staff/mfa/verify invalid body");
  }

  try {
    const staffId = await getPendingStaffId();
    if (!staffId) {
      throw new MfaSetupRequiredError("Your sign-in session expired. Sign in again.");
    }

    const staff = await getStaffViewById(staffId);
    if (!staff) throw new UnauthenticatedError();
    if (!staffRoleRequiresMfa(staff.role)) {
      throw new ForbiddenError("Two-step verification is not required for your role.");
    }

    const decision = staffMfaVerifyLimiter.check(clientKey(request, `mfa:${staffId}`));
    if (!decision.allowed) {
      throw new TooManyRequestsError(undefined, decision.retryAfterSeconds);
    }

    const valid = await verifyPendingMfa(staffId, parsed.data.code);
    if (!valid) {
      recordAudit({
        actorStaffId: staffId,
        action: AUDIT_ACTION.STAFF_MFA_FAILED,
        targetStaffId: staffId,
      });
      throw new MfaInvalidError();
    }

    recordAudit({
      actorStaffId: staffId,
      action: AUDIT_ACTION.STAFF_MFA_VERIFIED,
      targetStaffId: staffId,
    });

    if (!staff.mfaEnabled) {
      await enableMfa(staffId);
    }

    await destroyMfaPendingCookie();
    // The session only exists after a verified code - mark it MFA-satisfied so
    // loadCurrentStaff will keep resolving this staff member.
    await createStaffSession(staffId, STAFF_SESSION_TTL_MS, true);

    return toSuccessResponse({ ok: true, redirectTo: "/pos", mfaEnabled: true });
  } catch (error) {
    return toErrorResponse(error, "POST /api/staff/mfa/verify failed");
  }
}