import { requireStaffApi } from "@/lib/auth/staff-session";
import { STAFF_PERMISSION } from "@/lib/constants/staff";
import { getCustomerReceivablesAging } from "@/lib/services/analytics.service";
import { ForbiddenError } from "@/lib/utils/errors";
import { toErrorResponse, toSuccessResponse } from "@/lib/utils/http";

export async function GET() {
  let staff: Awaited<ReturnType<typeof requireStaffApi>>;
  try {
    staff = await requireStaffApi();
    const canAccess =
      staff.effectivePermissions.includes(STAFF_PERMISSION.PAYMENTS_READ) ||
      staff.effectivePermissions.includes(STAFF_PERMISSION.ACCESS_REPORTS) ||
      staff.effectivePermissions.includes(STAFF_PERMISSION.ACCESS_CUSTOMERS);
    if (!canAccess) throw new ForbiddenError();
  } catch (error) {
    return toErrorResponse(error, "GET /api/pos/analytics/receivables auth");
  }

  try {
    const receivables = await getCustomerReceivablesAging(staff);
    return toSuccessResponse(receivables);
  } catch (error) {
    return toErrorResponse(error, "GET /api/pos/analytics/receivables failed");
  }
}
