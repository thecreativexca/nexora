import type { NextRequest } from "next/server";

import { requirePermissionApi } from "@/lib/auth/staff-session";
import { STAFF_PERMISSION } from "@/lib/constants/staff";
import { POS_MAX_PAGE_SIZE, POS_PAGE_SIZE } from "@/lib/constants/pos";
import { listPosProducts } from "@/lib/services/pos.service";
import { toErrorResponse, toSuccessResponse } from "@/lib/utils/http";
import { validationError } from "@/lib/utils/errors";
import { posProductQuerySchema } from "@/lib/validations/pos";

/**
 * Register catalogue API (staff only).
 *
 * - Requires the ACCESS_REGISTER permission (any staff role).
 * - Returns active products inside active categories, with cost withheld.
 * - Search is regex-escaped server-side.
 */
export async function GET(request: NextRequest) {
  try {
    await requirePermissionApi(STAFF_PERMISSION.ACCESS_REGISTER);
  } catch (error) {
    return toErrorResponse(error, "GET /api/pos/products auth");
  }

  const rawParams: Record<string, string> = {};
  for (const [key, value] of request.nextUrl.searchParams.entries()) {
    rawParams[key] = value;
  }

  const parsed = posProductQuerySchema.safeParse(rawParams);
  if (!parsed.success) {
    return toErrorResponse(
      validationError(parsed.error, "Check the query parameters and try again."),
      "GET /api/pos/products invalid query",
    );
  }

  try {
    const { q, categoryId, page, pageSize } = parsed.data;
    const result = await listPosProducts({
      search: q ?? "",
      categoryId: categoryId ?? "",
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Math.min(Number(pageSize), POS_MAX_PAGE_SIZE) : POS_PAGE_SIZE,
    });

    return toSuccessResponse(result);
  } catch (error) {
    return toErrorResponse(error, "GET /api/pos/products failed");
  }
}