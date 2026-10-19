import type { NextRequest } from "next/server";

import { ORDER_CHANNEL, ORDERS_MAX_PAGE, ORDERS_MAX_PAGE_SIZE, ORDERS_PAGE_SIZE } from "@/lib/constants/order";
import { requirePermissionApi, requireStaffApi } from "@/lib/auth/staff-session";
import { STAFF_PERMISSION } from "@/lib/constants/staff";
import { listStaffOrders } from "@/lib/services/staff-orders.service";
import { toErrorResponse, toSuccessResponse } from "@/lib/utils/http";
import { ForbiddenError, validationError } from "@/lib/utils/errors";
import { staffOrderListQuerySchema } from "@/lib/validations/staff-order";

/**
 * Orders management list (staff only - any authenticated role).
 *
 * Serves BOTH channels from the single Order collection. Filters, search and
 * pagination are strict-Zod validated; page/pageSize are capped server-side so
 * a hand-crafted `?limit=1000000` can never overload the server.
 */
export async function GET(request: NextRequest) {
  let staff: Awaited<ReturnType<typeof requireStaffApi>>;
  try {
    staff = await requireStaffApi();
    const canAccessOrders =
      staff.effectivePermissions.includes(STAFF_PERMISSION.ACCESS_ORDERS) ||
      staff.effectivePermissions.includes(STAFF_PERMISSION.ORDERS_VIEW_OWN);
    if (!canAccessOrders) {
      throw new ForbiddenError();
    }
  } catch (error) {
    return toErrorResponse(error, "GET /api/pos/orders auth");
  }

  const rawParams: Record<string, string> = {};
  for (const [key, value] of request.nextUrl.searchParams.entries()) {
    rawParams[key] = value;
  }

  const parsed = staffOrderListQuerySchema.safeParse(rawParams);
  if (!parsed.success) {
    return toErrorResponse(
      validationError(parsed.error, "Check the filters and try again."),
      "GET /api/pos/orders invalid query",
    );
  }

  const page = Math.min(Number(parsed.data.page ?? "1"), ORDERS_MAX_PAGE);
  const pageSize = Math.min(
    Number(parsed.data.pageSize ?? String(ORDERS_PAGE_SIZE)),
    ORDERS_MAX_PAGE_SIZE,
  );

  const channel =
    parsed.data.channel === undefined || parsed.data.channel === "ALL"
      ? undefined
      : parsed.data.channel === ORDER_CHANNEL.IN_STORE
        ? ORDER_CHANNEL.IN_STORE
        : ORDER_CHANNEL.ONLINE;

  try {
    const result = await listStaffOrders({
      page,
      pageSize,
      channel,
      status: parsed.data.status,
      search: parsed.data.search ?? "",
      actor: staff,
    });
    return toSuccessResponse(result);
  } catch (error) {
    return toErrorResponse(error, "GET /api/pos/orders failed");
  }
}