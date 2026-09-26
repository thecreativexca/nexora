import { assertSameOrigin } from "@/lib/security/same-origin";
import { completePayPalCheckout } from "@/lib/services/paypal-checkout.service";
import { validationError } from "@/lib/utils/errors";
import { readJsonBody, toErrorResponse, toSuccessResponse } from "@/lib/utils/http";
import { paypalCaptureSchema } from "@/lib/validations/order";
export async function POST(request: Request) {
  try { assertSameOrigin(request); } catch (error) { return toErrorResponse(error, "PayPal capture origin"); }
  const body = await readJsonBody(request, "PayPal capture invalid JSON"); if ("error" in body) return body.error;
  const parsed = paypalCaptureSchema.safeParse(body.body); if (!parsed.success) return toErrorResponse(validationError(parsed.error), "PayPal capture invalid body");
  try { return toSuccessResponse(await completePayPalCheckout(parsed.data.sessionId, parsed.data.paypalOrderId)); }
  catch (error) { return toErrorResponse(error, "PayPal capture failed"); }
}
