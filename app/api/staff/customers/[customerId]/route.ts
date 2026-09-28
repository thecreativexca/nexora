import type { NextRequest } from "next/server";

import { requirePermissionApi } from "@/lib/auth/staff-session";
import { STAFF_PERMISSION } from "@/lib/constants/staff";
import { setCustomerActive } from "@/lib/services/customer.service";
import { InvalidRequestError, validationError } from "@/lib/utils/errors";
import { readJsonBody, toErrorResponse, toSuccessResponse } from "@/lib/utils/http";
import { customerAdminActionSchema } from "@/lib/validations/customer";

interface RouteContext {
  params: Promise<{ customerId: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const parsedBody = await readJsonBody(request, "PATCH /api/staff/customers/[customerId] invalid JSON");
  if ("error" in parsedBody) return parsedBody.error;

  const parsed = customerAdminActionSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return toErrorResponse(validationError(parsed.error), "PATCH /api/staff/customers/[customerId] invalid body");
  }

  try {
    await requirePermissionApi(STAFF_PERMISSION.MANAGE_CUSTOMERS);
    const { customerId } = await params;
    if (customerId !== parsed.data.customerId) {
      throw new InvalidRequestError("The customer identifier does not match this route.");
    }
    const customer = await setCustomerActive(customerId, parsed.data.isActive);
    return toSuccessResponse({ customer });
  } catch (error) {
    return toErrorResponse(error, "PATCH /api/staff/customers/[customerId] failed");
  }
}
