import type { NextRequest } from "next/server";

import { requirePermissionApi } from "@/lib/auth/staff-session";
import { STAFF_PERMISSION } from "@/lib/constants/staff";
import { processSalesReturn } from "@/lib/services/returns.service";
import { parseJsonBody, toErrorResponse, toSuccessResponse } from "@/lib/utils/http";
import { validationError } from "@/lib/utils/errors";
import { salesReturnSchema } from "@/lib/validations/pos";

interface RouteParams {
  params: Promise<{ orderNumber: string }>;
}

/**
 * Itemized sales return and refund endpoint.
 * Requires ISSUE_REFUND permission.
 * Validates eligible quantities, restocks sellable items atomically into inventory,
 * tracks damaged items in the stock ledger, records offline refund and updates payment status.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  let staff;
  try {
    staff = await requirePermissionApi(STAFF_PERMISSION.ISSUE_REFUND);
  } catch (error) {
    return toErrorResponse(error, "POST /api/pos/orders/[orderNumber]/return auth");
  }

  const { orderNumber } = await params;
  const parsedBody = await parseJsonBody(request);
  if ("error" in parsedBody) return parsedBody.error;
  const parsed = salesReturnSchema.safeParse(parsedBody.body);

  if (!parsed.success) {
    return toErrorResponse(
      validationError(parsed.error, "Check return items and try again."),
      "POST /api/pos/orders/[orderNumber]/return invalid payload",
    );
  }

  try {
    const result = await processSalesReturn(
      {
        orderNumber,
        items: parsed.data.items,
        refundMethod: parsed.data.refundMethod,
        referenceNumber: parsed.data.referenceNumber,
        notes: parsed.data.notes,
      },
      staff,
    );

    return toSuccessResponse(result);
  } catch (error) {
    return toErrorResponse(error, "POST /api/pos/orders/[orderNumber]/return failed");
  }
}
