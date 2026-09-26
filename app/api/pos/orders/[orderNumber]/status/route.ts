import type { NextRequest } from "next/server";

import { requirePermissionApi } from "@/lib/auth/staff-session";
import { STAFF_PERMISSION } from "@/lib/constants/staff";
import { updateStaffOrderStatus } from "@/lib/services/staff-orders.service";
import { validationError } from "@/lib/utils/errors";
import { readJsonBody, toErrorResponse, toSuccessResponse } from "@/lib/utils/http";
import { staffOrderStatusSchema } from "@/lib/validations/staff-order";

interface RouteContext {
  params: Promise<{ orderNumber: string }>;
}

/**
 * Move an ONLINE order along the controlled delivery workflow
 * (ORDER_PLACED -> PREPARING -> ON_THE_WAY -> DELIVERED).
 *
 * Requires the MANAGE_ORDER_STATUS permission (MANAGER/SUPER_ADMIN) - the role
 * is re-checked from the authenticated session (never trusted from the body),
 * and transition legality is validated against MongoDB state inside the service.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  let actor: Awaited<ReturnType<typeof requirePermissionApi>>;
  try {
    actor = await requirePermissionApi(STAFF_PERMISSION.MANAGE_ORDER_STATUS);
  } catch (error) {
    return toErrorResponse(error, "PATCH /api/pos/orders/[orderNumber]/status auth");
  }

  const { orderNumber } = await params;

  const parsedBody = await readJsonBody(
    request,
    "PATCH /api/pos/orders/[orderNumber]/status malformed body",
  );
  if ("error" in parsedBody) return parsedBody.error;

  const parsed = staffOrderStatusSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return toErrorResponse(
      validationError(parsed.error, "Choose a valid next status."),
      "PATCH /api/pos/orders/[orderNumber]/status invalid payload",
    );
  }

  try {
    const order = await updateStaffOrderStatus(orderNumber, parsed.data.newStatus, actor);
    return toSuccessResponse({ order });
  } catch (error) {
    return toErrorResponse(
      error,
      "PATCH /api/pos/orders/[orderNumber]/status failed",
    );
  }
}