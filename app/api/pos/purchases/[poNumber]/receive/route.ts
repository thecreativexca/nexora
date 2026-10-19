import type { NextRequest } from "next/server";

import { requirePermissionApi } from "@/lib/auth/staff-session";
import { STAFF_PERMISSION } from "@/lib/constants/staff";
import { receivePurchaseOrderItems } from "@/lib/services/purchase.service";
import { parseJsonBody, toErrorResponse, toSuccessResponse } from "@/lib/utils/http";
import { validationError } from "@/lib/utils/errors";
import { purchaseOrderReceiveSchema } from "@/lib/validations/pos";

interface RouteParams {
  params: Promise<{ poNumber: string }>;
}

/**
 * Goods Receipt API.
 * Receives physical items against an approved purchase order.
 * Strictly increments stock ONLY for accepted quantities and appends
 * immutable audit ledger entries in StockMovement.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  let staff;
  try {
    staff = await requirePermissionApi(STAFF_PERMISSION.INVENTORY_UPDATE);
  } catch (error) {
    return toErrorResponse(error, "POST /api/pos/purchases/[poNumber]/receive auth");
  }

  const { poNumber } = await params;
  const parsedBody = await parseJsonBody(request);
  if ("error" in parsedBody) return parsedBody.error;
  const parsed = purchaseOrderReceiveSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return toErrorResponse(
      validationError(parsed.error, "Check the received goods quantities and items."),
      "POST /api/pos/purchases/[poNumber]/receive invalid payload",
    );
  }

  try {
    const updated = await receivePurchaseOrderItems(poNumber, parsed.data, staff);
    return toSuccessResponse(updated);
  } catch (error) {
    return toErrorResponse(error, "POST /api/pos/purchases/[poNumber]/receive failed");
  }
}
