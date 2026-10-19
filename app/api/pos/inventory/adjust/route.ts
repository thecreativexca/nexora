import type { NextRequest } from "next/server";

import { requirePermissionApi } from "@/lib/auth/staff-session";
import { STAFF_PERMISSION } from "@/lib/constants/staff";
import { adjustProductStock } from "@/lib/services/inventory.service";
import { parseJsonBody, toErrorResponse, toSuccessResponse } from "@/lib/utils/http";
import { validationError } from "@/lib/utils/errors";
import { stockAdjustmentSchema } from "@/lib/validations/pos";

/**
 * Manual stock adjustment endpoint.
 * Requires INVENTORY_ADJUST_STOCK permission (Admin, Manager).
 * Atomically modifies stock and creates an immutable audit trail entry in StockMovement.
 */
export async function POST(request: NextRequest) {
  let staff;
  try {
    staff = await requirePermissionApi(STAFF_PERMISSION.INVENTORY_ADJUST_STOCK);
  } catch (error) {
    return toErrorResponse(error, "POST /api/pos/inventory/adjust auth");
  }

  const parsedBody = await parseJsonBody(request);
  if ("error" in parsedBody) return parsedBody.error;
  const parsed = stockAdjustmentSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return toErrorResponse(
      validationError(parsed.error, "Check the adjustment inputs and try again."),
      "POST /api/pos/inventory/adjust invalid payload",
    );
  }

  try {
    const updated = await adjustProductStock(
      parsed.data.productId,
      parsed.data.quantityChange,
      parsed.data.reason,
      staff,
    );

    return toSuccessResponse(updated);
  } catch (error) {
    return toErrorResponse(error, "POST /api/pos/inventory/adjust failed");
  }
}
