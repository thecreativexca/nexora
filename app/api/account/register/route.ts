import type { NextRequest } from "next/server";

import { createCustomerSession } from "@/lib/auth/customer-session";
import { registerCustomer } from "@/lib/services/customer.service";
import { validationError } from "@/lib/utils/errors";
import { readJsonBody, toErrorResponse, toSuccessResponse } from "@/lib/utils/http";
import { customerRegistrationSchema } from "@/lib/validations/customer";

/** Creates a customer account and signs it in immediately. */
export async function POST(request: NextRequest) {
  const parsedBody = await readJsonBody(request, "POST /api/account/register invalid JSON");
  if ("error" in parsedBody) return parsedBody.error;

  const parsed = customerRegistrationSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return toErrorResponse(
      validationError(parsed.error),
      "POST /api/account/register invalid body",
    );
  }

  try {
    const customer = await registerCustomer({
      name: parsed.data.name,
      email: parsed.data.email,
      password: parsed.data.password,
      phone: parsed.data.phone,
    });
    await createCustomerSession(customer.id);
    return toSuccessResponse({ customer }, 201);
  } catch (error) {
    return toErrorResponse(error, "POST /api/account/register failed");
  }
}
