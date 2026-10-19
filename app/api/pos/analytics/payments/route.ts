import { NextRequest } from "next/server";

import { requireStaffApi } from "@/lib/auth/staff-session";
import { STAFF_PERMISSION } from "@/lib/constants/staff";
import {
  getOfflinePaymentAnalytics,
  type DateRangePreset,
} from "@/lib/services/analytics.service";
import { ForbiddenError } from "@/lib/utils/errors";
import { toErrorResponse, toSuccessResponse } from "@/lib/utils/http";

export async function GET(request: NextRequest) {
  let staff: Awaited<ReturnType<typeof requireStaffApi>>;
  try {
    staff = await requireStaffApi();
    const canAccess =
      staff.effectivePermissions.includes(STAFF_PERMISSION.PAYMENTS_READ) ||
      staff.effectivePermissions.includes(STAFF_PERMISSION.ACCESS_REPORTS) ||
      staff.effectivePermissions.includes(STAFF_PERMISSION.REPORTS_VIEW_OWN);
    if (!canAccess) throw new ForbiddenError();
  } catch (error) {
    return toErrorResponse(error, "GET /api/pos/analytics/payments auth");
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const preset = (searchParams.get("preset") as DateRangePreset) || "this_month";
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;

    const payments = await getOfflinePaymentAnalytics(preset, startDate, endDate, staff);
    return toSuccessResponse({ payments });
  } catch (error) {
    return toErrorResponse(error, "GET /api/pos/analytics/payments failed");
  }
}
