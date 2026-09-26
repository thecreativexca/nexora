import { requirePermissionApi } from "@/lib/auth/staff-session";
import { STAFF_PERMISSION } from "@/lib/constants/staff";
import { listInvitations } from "@/lib/services/invitation.service";
import { listStaff } from "@/lib/services/staff.service";
import { toErrorResponse, toSuccessResponse } from "@/lib/utils/http";

/** Team Access screen: staff list + invitations in one call. */
export async function GET() {
  try {
    await requirePermissionApi(STAFF_PERMISSION.MANAGE_TEAM);
    const [staff, invitations] = await Promise.all([listStaff(), listInvitations()]);
    return toSuccessResponse({ staff, invitations });
  } catch (error) {
    return toErrorResponse(error, "GET /api/staff/team failed");
  }
}