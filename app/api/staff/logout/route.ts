import { AUDIT_ACTION } from "@/lib/constants/audit";
import { destroyMfaPendingCookie } from "@/lib/auth/mfa-pending";
import { destroyStaffSession, getCurrentStaff } from "@/lib/auth/staff-session";
import { recordAudit } from "@/lib/services/audit.service";
import { toErrorResponse, toSuccessResponse } from "@/lib/utils/http";

/** Ends the staff session: revokes the token server-side and clears cookies. */
export async function POST() {
  try {
    const staff = await getCurrentStaff();
    if (staff) {
      recordAudit({
        actorStaffId: staff.id,
        action: AUDIT_ACTION.STAFF_LOGOUT,
        targetStaffId: staff.id,
      });
    }
    await destroyStaffSession();
    await destroyMfaPendingCookie();
    return toSuccessResponse({ ok: true, redirectTo: "/pos/login" });
  } catch (error) {
    return toErrorResponse(error, "POST /api/staff/logout failed");
  }
}