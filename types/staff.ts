import type { StaffRole } from "@/lib/constants/staff";

/**
 * Safe staff shape that may be sent to the browser. Never includes
 * passwordHash, MFA secrets or internal identifiers beyond the record `_id`.
 */
export interface StaffView {
  id: string;
  email: string;
  name: string;
  role: StaffRole;
  isActive: boolean;
  mfaEnabled: boolean;
  mfaVerifiedAt: string | null;
  lastLoginAt: string | null;
  invitedBy: string | null;
  createdAt: string;
}

/** Next step after successful password authentication. */
export type StaffAuthNextStep = "COMPLETE" | "MFA_VERIFY";

export interface StaffAuthResult {
  staff: StaffView;
  nextStep: StaffAuthNextStep;
}