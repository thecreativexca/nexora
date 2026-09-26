import { requirePermissionApi } from "@/lib/auth/staff-session";
import { STAFF_PERMISSION } from "@/lib/constants/staff";
import { getSalesReport } from "@/lib/services/reports.service";
import { toErrorResponse, toSuccessResponse } from "@/lib/utils/http";

/**
 * Sales reports (MANAGER/SUPER_ADMIN only).
 *
 * CASHIER calling this endpoint directly is denied server-side (their role
 * lacks ACCESS_REPORTS). All metrics are aggregated live from MongoDB Order
 * documents - nothing is hardcoded or faked.
 */
export async function GET() {
  try {
    await requirePermissionApi(STAFF_PERMISSION.ACCESS_REPORTS);
  } catch (error) {
    return toErrorResponse(error, "GET /api/pos/reports auth");
  }

  try {
    const report = await getSalesReport();
    return toSuccessResponse({ report });
  } catch (error) {
    return toErrorResponse(error, "GET /api/pos/reports failed");
  }
}