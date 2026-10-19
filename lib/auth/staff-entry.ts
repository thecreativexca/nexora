import "server-only";

import { createStaffSession } from "@/lib/auth/staff-session";
import type { StaffAuthResult } from "@/types/staff";

export interface StaffEntryResponse {
  step: "COMPLETE";
  redirectTo: string;
  staff?: StaffAuthResult["staff"];
}

/**
 * Finalises a successful password step by creating the staff session
 * immediately. There is no second verification step.
 */
export async function createStaffEntry(
  state: StaffAuthResult,
): Promise<StaffEntryResponse> {
  await createStaffSession(state.staff.id);
  return { step: "COMPLETE", redirectTo: "/pos", staff: state.staff };
}
