import type { NextRequest } from "next/server";

import { requirePermissionApi } from "@/lib/auth/staff-session";
import { STAFF_PERMISSION } from "@/lib/constants/staff";
import { refundStaffOrder } from "@/lib/services/staff-orders.service";
import { validationError } from "@/lib/utils/errors";
import { readJsonBody, toErrorResponse, toSuccessResponse } from "@/lib/utils/http";
import { refundRequestSchema } from "@/lib/validations/staff-order";

interface RouteContext {
  params: Promise<{ orderNumber: string }>;
}

/**
 * Issue a permanent FULL-ORDER refund (requires the ISSUE_REFUND permission -
 * MANAGER/SUPER_ADMIN only).
 *
 * The refund runs inside one MongoDB transaction: physical stock is restored,
 * the order is marked REFUNDED and a COMPLETED refund record is appended. Any
 * failure rolls everything back, and a second (even concurrent) refund is
 * rejected. CASHIER is denied here - not by hiding a button.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  let actor: Awaited<ReturnType<typeof requirePermissionApi>>;
  try {
    actor = await requirePermissionApi(STAFF_PERMISSION.ISSUE_REFUND);
  } catch (error) {
    return toErrorResponse(error, "POST /api/pos/orders/[orderNumber]/refund auth");
  }

  const { orderNumber } = await params;

  const parsedBody = await readJsonBody(
    request,
    "POST /api/pos/orders/[orderNumber]/refund malformed body",
  );
  if ("error" in parsedBody) return parsedBody.error;

  const parsed = refundRequestSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return toErrorResponse(
      validationError(parsed.error, "Add a short reason to refund this order."),
      "POST /api/pos/orders/[orderNumber]/refund invalid payload",
    );
  }

  try {
    const outcome = await refundStaffOrder(orderNumber, parsed.data.reason, actor);
    return toSuccessResponse({
      order: outcome.order,
      restoredItems: outcome.restoredItems,
      missingProducts: outcome.missingProducts,
    });
  } catch (error) {
    return toErrorResponse(
      error,
      "POST /api/pos/orders/[orderNumber]/refund failed",
    );
  }
}