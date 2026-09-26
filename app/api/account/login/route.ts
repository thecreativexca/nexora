import type { NextRequest } from "next/server";

import { createCustomerSession } from "@/lib/auth/customer-session";
import { authenticateCustomer } from "@/lib/services/customer.service";
import { validationError } from "@/lib/utils/errors";
import { readJsonBody, toErrorResponse, toSuccessResponse } from "@/lib/utils/http";
import { customerLoginSchema } from "@/lib/validations/customer";

/** Verifies credentials and starts a session. Failures stay generic. */
export async function POST(request: NextRequest) {
  const parsedBody = await readJsonBody(request, "POST /api/account/login invalid JSON");
  if ("error" in parsedBody) return parsedBody.error;

  const parsed = customerLoginSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return toErrorResponse(validationError(parsed.error), "POST /api/account/login invalid body");
  }

  try {
    const customer = await authenticateCustomer(parsed.data.email, parsed.data.password);
    await createCustomerSession(customer.id);
    return toSuccessResponse({ customer });
  } catch (error) {
    return toErrorResponse(error, "POST /api/account/login failed");
  }
}
