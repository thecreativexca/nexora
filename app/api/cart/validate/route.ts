import type { NextRequest } from "next/server";

import { validateCartLines } from "@/lib/services/cart.service";
import { InvalidRequestError, validationError } from "@/lib/utils/errors";
import { toErrorResponse, toSuccessResponse } from "@/lib/utils/http";
import { cartValidateRequestSchema } from "@/lib/validations/cart";

/**
 * Re-prices and re-checks a browser cart against MongoDB.
 *
 * The browser only sends product ids + quantities; prices, stock and
 * availability come back from the database. Placeholder prices sent by a
 * tampered client are simply ignored.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return toErrorResponse(
      new InvalidRequestError("Send a valid JSON body."),
      "POST /api/cart/validate invalid JSON",
    );
  }

  const parsed = cartValidateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return toErrorResponse(
      validationError(parsed.error, "Your bag could not be validated."),
      "POST /api/cart/validate invalid body",
    );
  }

  try {
    const validation = await validateCartLines(parsed.data.lines);
    return toSuccessResponse(validation);
  } catch (error) {
    return toErrorResponse(error, "POST /api/cart/validate failed");
  }
}
