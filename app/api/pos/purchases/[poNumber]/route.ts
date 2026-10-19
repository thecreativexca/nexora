import type { NextRequest } from "next/server";

import { requirePermissionApi } from "@/lib/auth/staff-session";
import { STAFF_PERMISSION } from "@/lib/constants/staff";
import {
  approvePurchaseOrder,
  getPurchaseOrderDetail,
} from "@/lib/services/purchase.service";
import { NotFoundError } from "@/lib/utils/errors";
import { toErrorResponse, toSuccessResponse } from "@/lib/utils/http";

interface RouteParams {
  params: Promise<{ poNumber: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    await requirePermissionApi(STAFF_PERMISSION.ACCESS_INVENTORY);
  } catch (error) {
    return toErrorResponse(error, "GET /api/pos/purchases/[poNumber] auth");
  }

  const { poNumber } = await params;
  try {
    const po = await getPurchaseOrderDetail(poNumber);
    if (!po) {
      return toErrorResponse(
        new NotFoundError(`Purchase order ${poNumber} not found.`),
        "GET /api/pos/purchases/[poNumber] not found",
      );
    }

    return toSuccessResponse(po);
  } catch (error) {
    return toErrorResponse(error, "GET /api/pos/purchases/[poNumber] failed");
  }
}

/** Approve a purchase order so goods can be received against it */
export async function POST(_request: NextRequest, { params }: RouteParams) {
  let staff;
  try {
    staff = await requirePermissionApi(STAFF_PERMISSION.INVENTORY_UPDATE);
  } catch (error) {
    return toErrorResponse(error, "POST /api/pos/purchases/[poNumber] approve auth");
  }

  const { poNumber } = await params;
  try {
    const updated = await approvePurchaseOrder(poNumber, staff);
    return toSuccessResponse(updated);
  } catch (error) {
    return toErrorResponse(error, "POST /api/pos/purchases/[poNumber] approve failed");
  }
}
