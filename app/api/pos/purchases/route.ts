import type { NextRequest } from "next/server";

import { requirePermissionApi } from "@/lib/auth/staff-session";
import { STAFF_PERMISSION } from "@/lib/constants/staff";
import {
  createPurchaseOrder,
  listPurchaseOrders,
} from "@/lib/services/purchase.service";
import { parseJsonBody, toErrorResponse, toSuccessResponse } from "@/lib/utils/http";
import { validationError } from "@/lib/utils/errors";
import { purchaseOrderCreateSchema } from "@/lib/validations/pos";

export async function GET(request: NextRequest) {
  try {
    await requirePermissionApi(STAFF_PERMISSION.ACCESS_INVENTORY);
  } catch (error) {
    return toErrorResponse(error, "GET /api/pos/purchases auth");
  }

  const { searchParams } = request.nextUrl;
  const supplierId = searchParams.get("supplierId") ?? undefined;
  const status = searchParams.get("status") ?? undefined;
  const page = searchParams.get("page") ? parseInt(searchParams.get("page")!, 10) : 1;
  const pageSize = searchParams.get("pageSize") ? parseInt(searchParams.get("pageSize")!, 10) : 25;

  try {
    const result = await listPurchaseOrders({ supplierId, status, page, pageSize });
    return toSuccessResponse(result);
  } catch (error) {
    return toErrorResponse(error, "GET /api/pos/purchases failed");
  }
}

export async function POST(request: NextRequest) {
  let staff;
  try {
    staff = await requirePermissionApi(STAFF_PERMISSION.INVENTORY_CREATE);
  } catch (error) {
    return toErrorResponse(error, "POST /api/pos/purchases auth");
  }

  const parsedBody = await parseJsonBody(request);
  if ("error" in parsedBody) return parsedBody.error;
  const parsed = purchaseOrderCreateSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return toErrorResponse(
      validationError(parsed.error, "Check the purchase order lines and supplier."),
      "POST /api/pos/purchases invalid payload",
    );
  }

  try {
    const created = await createPurchaseOrder(parsed.data, staff);
    return toSuccessResponse(created, 201);
  } catch (error) {
    return toErrorResponse(error, "POST /api/pos/purchases failed");
  }
}
