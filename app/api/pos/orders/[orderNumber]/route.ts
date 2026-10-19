import type { NextRequest } from "next/server";

import { requireStaffApi } from "@/lib/auth/staff-session";
import { STAFF_PERMISSION } from "@/lib/constants/staff";
import { getStaffOrderDetail } from "@/lib/services/staff-orders.service";
import { ForbiddenError, NotFoundError } from "@/lib/utils/errors";
import { toErrorResponse, toSuccessResponse } from "@/lib/utils/http";

interface RouteContext {
  params: Promise<{ orderNumber: string }>;
}

/**
 * Single order detail (staff only). Returns only the order's own snapshot
 * fields - customer password data, staff password hashes and session
 * internals are never part of any order document and never leave the server.
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const staff = await requireStaffApi();
    const canAccess =
      staff.effectivePermissions.includes(STAFF_PERMISSION.ACCESS_ORDERS) ||
      staff.effectivePermissions.includes(STAFF_PERMISSION.ORDERS_VIEW_OWN);
    if (!canAccess) throw new ForbiddenError();

    const { orderNumber } = await params;
    const order = await getStaffOrderDetail(orderNumber, staff);
    if (!order) throw new NotFoundError("No order matches that number.");
    return toSuccessResponse({ order });
  } catch (error) {
    return toErrorResponse(
      error,
      "GET /api/pos/orders/[orderNumber] failed",
    );
  }
}