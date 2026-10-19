import { requireStaffApi } from "@/lib/auth/staff-session";
import { STAFF_PERMISSION } from "@/lib/constants/staff";
import { getInventoryAnalytics } from "@/lib/services/analytics.service";
import { ForbiddenError } from "@/lib/utils/errors";
import { toErrorResponse, toSuccessResponse } from "@/lib/utils/http";

export async function GET() {
  let staff: Awaited<ReturnType<typeof requireStaffApi>>;
  try {
    staff = await requireStaffApi();
    const canAccess =
      staff.effectivePermissions.includes(STAFF_PERMISSION.ACCESS_INVENTORY) ||
      staff.effectivePermissions.includes(STAFF_PERMISSION.ACCESS_REPORTS);
    if (!canAccess) throw new ForbiddenError();
  } catch (error) {
    return toErrorResponse(error, "GET /api/pos/analytics/inventory auth");
  }

  try {
    const inventory = await getInventoryAnalytics();
    return toSuccessResponse({ inventory });
  } catch (error) {
    return toErrorResponse(error, "GET /api/pos/analytics/inventory failed");
  }
}
