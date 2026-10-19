import { NextRequest } from "next/server";

import { requireStaffApi } from "@/lib/auth/staff-session";
import { STAFF_PERMISSION } from "@/lib/constants/staff";
import {
  getAdminOverviewKpis,
  getBusinessAlerts,
  type DateRangePreset,
} from "@/lib/services/analytics.service";
import { ForbiddenError } from "@/lib/utils/errors";
import { toErrorResponse, toSuccessResponse } from "@/lib/utils/http";

export async function GET(request: NextRequest) {
  let staff: Awaited<ReturnType<typeof requireStaffApi>>;
  try {
    staff = await requireStaffApi();
    const canAccess =
      staff.effectivePermissions.includes(STAFF_PERMISSION.ACCESS_DASHBOARD) ||
      staff.effectivePermissions.includes(STAFF_PERMISSION.ACCESS_STORE_DASHBOARD) ||
      staff.effectivePermissions.includes(STAFF_PERMISSION.ACCESS_REPORTS) ||
      staff.effectivePermissions.includes(STAFF_PERMISSION.REPORTS_VIEW_OWN);
    if (!canAccess) throw new ForbiddenError("Insufficient permissions to view dashboard overview.");
  } catch (error) {
    return toErrorResponse(error, "GET /api/pos/analytics/overview auth");
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const preset = (searchParams.get("preset") as DateRangePreset) || "this_month";
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;
    const storeId = searchParams.get("storeId") || undefined;

    const [overview, alerts] = await Promise.all([
      getAdminOverviewKpis(preset, startDate, endDate, storeId, staff),
      getBusinessAlerts(staff),
    ]);

    return toSuccessResponse({ overview, alerts });
  } catch (error) {
    return toErrorResponse(error, "GET /api/pos/analytics/overview failed");
  }
}
