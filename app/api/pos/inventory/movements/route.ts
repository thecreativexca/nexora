import type { NextRequest } from "next/server";

import { requirePermissionApi } from "@/lib/auth/staff-session";
import { STAFF_PERMISSION } from "@/lib/constants/staff";
import { listStockMovements } from "@/lib/services/stock-movement.service";
import { toErrorResponse, toSuccessResponse } from "@/lib/utils/http";

/**
 * Stock Movements ledger API.
 * Returns the immutable audit history of all inventory changes
 * (Sales, Purchases, Adjustments, Returns, Restocks, Damaged items).
 */
export async function GET(request: NextRequest) {
  try {
    await requirePermissionApi(STAFF_PERMISSION.ACCESS_INVENTORY);
  } catch (error) {
    return toErrorResponse(error, "GET /api/pos/inventory/movements auth");
  }

  const { searchParams } = request.nextUrl;
  const productId = searchParams.get("productId") ?? undefined;
  const sku = searchParams.get("sku") ?? undefined;
  const movementType = searchParams.get("movementType") ?? undefined;
  const page = searchParams.get("page") ? parseInt(searchParams.get("page")!, 10) : 1;
  const pageSize = searchParams.get("pageSize") ? parseInt(searchParams.get("pageSize")!, 10) : 25;

  try {
    const result = await listStockMovements({
      productId,
      sku,
      movementType,
      page,
      pageSize,
    });

    return toSuccessResponse(result);
  } catch (error) {
    return toErrorResponse(error, "GET /api/pos/inventory/movements failed");
  }
}
