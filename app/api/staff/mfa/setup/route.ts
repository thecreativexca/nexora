import QRCode from "qrcode";

import { getPendingStaffId } from "@/lib/auth/mfa-pending";
import { staffRoleRequiresMfa } from "@/lib/constants/staff";
import { stageMfaSecret } from "@/lib/services/mfa.service";
import { getStaffViewById } from "@/lib/services/staff.service";
import {
  ForbiddenError,
  MfaSetupRequiredError,
  UnauthenticatedError,
} from "@/lib/utils/errors";
import { toErrorResponse, toSuccessResponse } from "@/lib/utils/http";

/**
 * One-time MFA setup. Valid only while the HMAC-signed pre-auth cookie is in
 * place (i.e. after a correct password and BEFORE any session exists), so an
 * already-signed-in user can never hit this path.
 */
export async function POST() {
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
    if (staff.mfaEnabled) {
      throw new MfaSetupRequiredError("Two-step verification is already enabled.");
    }

    const { secret, otpauthUri } = await stageMfaSecret(staffId);
    const qrDataUrl = await QRCode.toDataURL(otpauthUri, {
      margin: 1,
      width: 260,
      errorCorrectionLevel: "M",
    });

    return toSuccessResponse({
      secret,
      otpauthUri,
      qrDataUrl,
      accountName: staff.email,
    });
  } catch (error) {
    return toErrorResponse(error, "POST /api/staff/mfa/setup failed");
  }
}