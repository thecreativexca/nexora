import { assertSameOrigin } from "@/lib/security/same-origin";
import { cancelPayPalCheckout } from "@/lib/services/paypal-checkout.service";
import { validationError } from "@/lib/utils/errors";
import { readJsonBody, toErrorResponse, toSuccessResponse } from "@/lib/utils/http";
import { paypalCancelSchema } from "@/lib/validations/order";
export async function POST(request: Request) {
  try { assertSameOrigin(request); } catch (error) { return toErrorResponse(error, "PayPal cancel origin"); }
  const body = await readJsonBody(request, "PayPal cancel invalid JSON"); if ("error" in body) return body.error;
  const parsed = paypalCancelSchema.safeParse(body.body); if (!parsed.success) return toErrorResponse(validationError(parsed.error), "PayPal cancel invalid body");
  try { await cancelPayPalCheckout(parsed.data.sessionId, parsed.data.paypalOrderId); return toSuccessResponse({ cancelled: true }); }
  catch (error) { return toErrorResponse(error, "PayPal cancel failed"); }
}
