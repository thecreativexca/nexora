import { getCurrentCustomerId } from "@/lib/auth/customer-session";
import { assertSameOrigin } from "@/lib/security/same-origin";
import { beginPayPalCheckout } from "@/lib/services/paypal-checkout.service";
import { validationError } from "@/lib/utils/errors";
import { readJsonBody, toErrorResponse, toSuccessResponse } from "@/lib/utils/http";
import { checkoutSchema } from "@/lib/validations/order";

export async function POST(request: Request) {
  try { assertSameOrigin(request); } catch (error) { return toErrorResponse(error, "PayPal create origin"); }
  const parsedBody = await readJsonBody(request, "PayPal create invalid JSON"); if ("error" in parsedBody) return parsedBody.error;
  const parsed = checkoutSchema.safeParse(parsedBody.body); if (!parsed.success) return toErrorResponse(validationError(parsed.error), "PayPal create invalid body");
  try { return toSuccessResponse(await beginPayPalCheckout(parsed.data, await getCurrentCustomerId()), 201); }
  catch (error) { return toErrorResponse(error, "PayPal create failed"); }
}
