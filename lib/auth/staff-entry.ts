import "server-only";

import { createMfaPendingCookie } from "@/lib/auth/mfa-pending";
import { createStaffSession } from "@/lib/auth/staff-session";
import type { StaffAuthResult } from "@/types/staff";

export type StaffEntryStep = "COMPLETE" | "MFA_SETUP" | "MFA_VERIFY";

export interface StaffEntryResponse {
  step: StaffEntryStep;
  redirectTo: string;
  staff?: StaffAuthResult["staff"];
}

/**
 * Finalises a successful password / invitation step:
 *
 * - Roles that do not require MFA (Cashier) get a real staff session now.
 * - Roles that require MFA only receive the short-lived pre-auth cookie; the
 *   session is created later, strictly after the MFA code verifies.
 */
export async function createStaffEntry(
  state: StaffAuthResult,
): Promise<StaffEntryResponse> {
  if (state.nextStep === "COMPLETE") {
    // Only roles that do not require MFA (Cashier) reach this step, so the
    // session is deliberately unverified. A later promotion to a role that
    // requires MFA invalidates it because loadCurrentStaff checks mfaVerified.
    await createStaffSession(state.staff.id);
    return { step: "COMPLETE", redirectTo: "/pos", staff: state.staff };
  }

  await createMfaPendingCookie(state.staff.id);
  if (state.nextStep === "MFA_SETUP") {
    return { step: "MFA_SETUP", redirectTo: "/pos/mfa/setup" };
  }
  return { step: "MFA_VERIFY", redirectTo: "/pos/mfa/verify" };
}