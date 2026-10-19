import type { NextRequest } from "next/server";

import { requireStaffApi } from "@/lib/auth/staff-session";
import { STAFF_PERMISSION } from "@/lib/constants/staff";
import { refundStaffOrder } from "@/lib/services/staff-orders.service";
import { ForbiddenError, validationError } from "@/lib/utils/errors";
import { readJsonBody, toErrorResponse, toSuccessResponse } from "@/lib/utils/http";
import { refundRequestSchema } from "@/lib/validations/staff-order";

interface RouteContext {
  params: Promise<{ orderNumber: string }>;
}

/**
 * Issue or request a refund (requires ISSUE_REFUND, PAYMENTS_REFUND_APPROVE, or PAYMENTS_REFUND_REQUEST).
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  let actor: Awaited<ReturnType<typeof requireStaffApi>>;
  try {
    actor = await requireStaffApi();
    const canRefund =
      actor.effectivePermissions.includes(STAFF_PERMISSION.ISSUE_REFUND) ||
      actor.effectivePermissions.includes(STAFF_PERMISSION.PAYMENTS_REFUND_APPROVE) ||
      actor.effectivePermissions.includes(STAFF_PERMISSION.PAYMENTS_REFUND_REQUEST);
    if (!canRefund) {
      throw new ForbiddenError("You are not authorized to issue or request refunds.");
    }
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
    const outcome = await refundStaffOrder(
      orderNumber,
      parsed.data.reason,
      actor,
      parsed.data.action,
    );
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