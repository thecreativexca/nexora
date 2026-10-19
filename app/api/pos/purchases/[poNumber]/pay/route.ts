import type { NextRequest } from "next/server";

import { requirePermissionApi } from "@/lib/auth/staff-session";
import { STAFF_PERMISSION } from "@/lib/constants/staff";
import { recordSupplierPayment } from "@/lib/services/purchase.service";
import { parseJsonBody, toErrorResponse, toSuccessResponse } from "@/lib/utils/http";
import { validationError } from "@/lib/utils/errors";
import { purchaseOrderPaymentSchema } from "@/lib/validations/pos";

interface RouteParams {
  params: Promise<{ poNumber: string }>;
}

/**
 * Supplier payment recording endpoint.
 * Requires PAYMENTS_COLLECT permission.
 * Reduces the supplier's outstanding due balance and records the payment transaction.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  let staff;
  try {
    staff = await requirePermissionApi(STAFF_PERMISSION.PAYMENTS_COLLECT);
  } catch (error) {
    return toErrorResponse(error, "POST /api/pos/purchases/[poNumber]/pay auth");
  }

  const { poNumber } = await params;
  const parsedBody = await parseJsonBody(request);
  if ("error" in parsedBody) return parsedBody.error;
  const parsed = purchaseOrderPaymentSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return toErrorResponse(
      validationError(parsed.error, "Check the payment amount and method."),
      "POST /api/pos/purchases/[poNumber]/pay invalid payload",
    );
  }

  try {
    const updated = await recordSupplierPayment(poNumber, parsed.data, staff);
    return toSuccessResponse(updated);
  } catch (error) {
    return toErrorResponse(error, "POST /api/pos/purchases/[poNumber]/pay failed");
  }
}
