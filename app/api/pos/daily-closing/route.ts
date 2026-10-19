import { NextRequest } from "next/server";

import { requireStaffApi } from "@/lib/auth/staff-session";
import { isSellerRole } from "@/lib/constants/staff";
import {
  getDailyCashSummary,
  listDailyClosings,
  recordDailyClosing,
  type RecordDailyClosingInput,
} from "@/lib/services/daily-closing.service";
import { getBusinessDays } from "@/lib/utils/business-time";
import { BadRequestError, ForbiddenError } from "@/lib/utils/errors";
import { toErrorResponse, toSuccessResponse } from "@/lib/utils/http";

export async function GET(request: NextRequest) {
  let staff: Awaited<ReturnType<typeof requireStaffApi>>;
  try {
    staff = await requireStaffApi();
    if (isSellerRole(staff.role)) {
      throw new ForbiddenError("Sellers do not have access to daily closing records.");
    }
  } catch (error) {
    return toErrorResponse(error, "GET /api/pos/daily-closing auth");
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const days = getBusinessDays(1);
    const dateKey = searchParams.get("dateKey") || days[0].dateKey;
    const storeId = searchParams.get("storeId") || undefined;

    const [liveSummary, pastClosings] = await Promise.all([
      getDailyCashSummary(dateKey, storeId),
      listDailyClosings(15),
    ]);

    return toSuccessResponse({ liveSummary, pastClosings });
  } catch (error) {
    return toErrorResponse(error, "GET /api/pos/daily-closing failed");
  }
}

export async function POST(request: NextRequest) {
  let staff: Awaited<ReturnType<typeof requireStaffApi>>;
  try {
    staff = await requireStaffApi();
    if (isSellerRole(staff.role)) {
      throw new ForbiddenError("Sellers are not permitted to finalize daily closing.");
    }
  } catch (error) {
    return toErrorResponse(error, "POST /api/pos/daily-closing auth");
  }

  try {
    const body = (await request.json()) as RecordDailyClosingInput;
    if (!body || typeof body !== "object") {
      throw new BadRequestError("Missing request body.");
    }
    if (!body.closingDate) {
      throw new BadRequestError("Property 'closingDate' is required.");
    }

    const closing = await recordDailyClosing(body, staff);
    return toSuccessResponse({ closing }, 201);
  } catch (error) {
    return toErrorResponse(error, "POST /api/pos/daily-closing failed");
  }
}
