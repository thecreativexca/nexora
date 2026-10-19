import { NextRequest } from "next/server";

import { requireStaffApi } from "@/lib/auth/staff-session";
import { isAdminRole } from "@/lib/constants/staff";
import {
  getFinancialAnalytics,
  type DateRangePreset,
} from "@/lib/services/analytics.service";
import { ForbiddenError } from "@/lib/utils/errors";
import { toErrorResponse, toSuccessResponse } from "@/lib/utils/http";

export async function GET(request: NextRequest) {
  let staff: Awaited<ReturnType<typeof requireStaffApi>>;
  try {
    staff = await requireStaffApi();
    if (!isAdminRole(staff.role)) {
      throw new ForbiddenError("Only Administrators can access company-wide financial reports.");
    }
  } catch (error) {
    return toErrorResponse(error, "GET /api/pos/analytics/financial auth");
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const preset = (searchParams.get("preset") as DateRangePreset) || "this_month";
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;
    const storeId = searchParams.get("storeId") || undefined;

    const financial = await getFinancialAnalytics(preset, startDate, endDate, storeId, staff);
    return toSuccessResponse({ financial });
  } catch (error) {
    return toErrorResponse(error, "GET /api/pos/analytics/financial failed");
  }
}
