import { requireStaffApi } from "@/lib/auth/staff-session";
import { STAFF_PERMISSION } from "@/lib/constants/staff";
import { getSalesReport } from "@/lib/services/reports.service";
import { ForbiddenError } from "@/lib/utils/errors";
import { toErrorResponse, toSuccessResponse } from "@/lib/utils/http";

/**
 * Sales reports.
 *
 * Denied server-side if staff lacks both ACCESS_REPORTS and REPORTS_VIEW_OWN.
 * If staff only has REPORTS_VIEW_OWN (e.g., Seller), only their own sales metrics are returned.
 */
export async function GET() {
  let staff: Awaited<ReturnType<typeof requireStaffApi>>;
  try {
    staff = await requireStaffApi();
    const canAccess =
      staff.effectivePermissions.includes(STAFF_PERMISSION.ACCESS_REPORTS) ||
      staff.effectivePermissions.includes(STAFF_PERMISSION.REPORTS_VIEW_OWN);
    if (!canAccess) throw new ForbiddenError();
  } catch (error) {
    return toErrorResponse(error, "GET /api/pos/reports auth");
  }

  try {
    const isOwnOnly =
      !staff.effectivePermissions.includes(STAFF_PERMISSION.ACCESS_REPORTS) &&
      staff.effectivePermissions.includes(STAFF_PERMISSION.REPORTS_VIEW_OWN);

    const report = await getSalesReport(isOwnOnly ? staff.id : undefined);
    return toSuccessResponse({ report });
  } catch (error) {
    return toErrorResponse(error, "GET /api/pos/reports failed");
  }
}