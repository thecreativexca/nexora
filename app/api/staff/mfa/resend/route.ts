import type { NextRequest } from "next/server";

import { getPendingStaffId } from "@/lib/auth/mfa-pending";
import { clientKey, staffLoginLimiter } from "@/lib/security/rate-limit";
import { requestStaffLoginOtp } from "@/lib/services/staff-email-otp.service";
import {
  MfaSetupRequiredError,
  TooManyRequestsError,
} from "@/lib/utils/errors";
import { toErrorResponse, toSuccessResponse } from "@/lib/utils/http";

/** Re-sends the sign-in code to the pending staff member's email. */
export async function POST(request: NextRequest) {
  try {
    const staffId = await getPendingStaffId();
    if (!staffId) {
      throw new MfaSetupRequiredError("Your sign-in session expired. Sign in again.");
    }

    const decision = staffLoginLimiter.check(clientKey(request, `otp-resend:${staffId}`));
    if (!decision.allowed) {
      throw new TooManyRequestsError(undefined, decision.retryAfterSeconds);
    }

    const result = await requestStaffLoginOtp(staffId);
    return toSuccessResponse(result);
  } catch (error) {
    return toErrorResponse(error, "POST /api/staff/mfa/resend failed");
  }
}