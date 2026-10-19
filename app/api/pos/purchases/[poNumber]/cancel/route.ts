import type { NextRequest } from "next/server";

import { requirePermissionApi } from "@/lib/auth/staff-session";
import { STAFF_PERMISSION } from "@/lib/constants/staff";
import { cancelPurchaseOrder } from "@/lib/services/purchase.service";
import { parseJsonBody, toErrorResponse, toSuccessResponse } from "@/lib/utils/http";

interface RouteParams {
  params: Promise<{ poNumber: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  let staff;
  try {
    staff = await requirePermissionApi(STAFF_PERMISSION.INVENTORY_ARCHIVE);
  } catch (error) {
    return toErrorResponse(error, "POST /api/pos/purchases/[poNumber]/cancel auth");
  }

  const { poNumber } = await params;
  const parsedBody = await parseJsonBody(request);
  if ("error" in parsedBody) return parsedBody.error;
  const body = parsedBody.body as { reason?: string } | null;
  const reason = body?.reason?.trim() || "Cancelled by authorized staff";

  try {
    const updated = await cancelPurchaseOrder(poNumber, reason, staff);
    return toSuccessResponse(updated);
  } catch (error) {
    return toErrorResponse(error, "POST /api/pos/purchases/[poNumber]/cancel failed");
  }
}
