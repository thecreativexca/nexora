import type { NextRequest } from "next/server";

import { getCurrentCustomer } from "@/lib/auth/customer-session";
import { updateCustomerProfile } from "@/lib/services/customer.service";
import { UnauthenticatedError, validationError } from "@/lib/utils/errors";
import { readJsonBody, toErrorResponse, toSuccessResponse } from "@/lib/utils/http";
import { customerProfileSchema } from "@/lib/validations/customer";

/** Returns the signed-in customer's own profile. */
export async function GET() {
  try {
    const customer = await getCurrentCustomer();
    if (!customer) throw new UnauthenticatedError();
    return toSuccessResponse({ customer });
  } catch (error) {
    return toErrorResponse(error, "GET /api/account/me failed");
  }
}

/** Updates name, phone and the single saved delivery address. */
export async function PATCH(request: NextRequest) {
  const parsedBody = await readJsonBody(request, "PATCH /api/account/me invalid JSON");
  if ("error" in parsedBody) return parsedBody.error;

  try {
    const customer = await getCurrentCustomer();
    if (!customer) throw new UnauthenticatedError();

    const parsed = customerProfileSchema.safeParse(parsedBody.body);
    if (!parsed.success) {
      return toErrorResponse(validationError(parsed.error), "PATCH /api/account/me invalid body");
    }

    const updated = await updateCustomerProfile(customer.id, {
      name: parsed.data.name,
      phone: parsed.data.phone,
      address: parsed.data.address,
    });
    return toSuccessResponse({ customer: updated });
  } catch (error) {
    return toErrorResponse(error, "PATCH /api/account/me failed");
  }
}
