import "server-only";

import { createMfaPendingCookie } from "@/lib/auth/mfa-pending";
import { createStaffSession } from "@/lib/auth/staff-session";
import { requestStaffLoginOtp } from "@/lib/services/staff-email-otp.service";
import { logger } from "@/lib/utils/logger";
import type { StaffAuthResult } from "@/types/staff";

export type StaffEntryStep = "COMPLETE" | "MFA_VERIFY";

export interface StaffEntryResponse {
  step: StaffEntryStep;
  redirectTo: string;
  staff?: StaffAuthResult["staff"];
}

/**
 * Finalises a successful password / invitation step:
 *
 * - Roles that do not require two-step sign-in (Cashier) get a real staff
 *   session now.
 * - Manager / Super-Admin receive the short-lived pre-auth cookie and an
 *   email OTP; the session is created later, strictly after the code verifies.
 */
export async function createStaffEntry(
  state: StaffAuthResult,
): Promise<StaffEntryResponse> {
  if (state.nextStep === "COMPLETE") {
    // Only roles that do not require two-step sign-in (Cashier) reach this
    // step, so the session is deliberately unverified. A later promotion to a
    // role that requires it invalidates it because loadCurrentStaff checks
    // mfaVerified.
    await createStaffSession(state.staff.id);
    return { step: "COMPLETE", redirectTo: "/pos", staff: state.staff };
  }

  await createMfaPendingCookie(state.staff.id);
  try {
    // Email the sign-in code as part of the password step so the code is
    // already waiting in the inbox when the verify page loads.
    await requestStaffLoginOtp(state.staff.id);
  } catch (error) {
    // Never block the password step on email delivery - the user can resend
    // from the verify page. Log and continue.
    logger.error("Sending the staff sign-in code failed", error);
  }
  return { step: "MFA_VERIFY", redirectTo: "/pos/mfa-verify" };
}