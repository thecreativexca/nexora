import { releaseExpiredCheckoutReservations } from "@/lib/services/paypal-checkout.service";
import { toSuccessResponse } from "@/lib/utils/http";
export async function POST(request: Request) {
  const expected = process.env.CHECKOUT_CLEANUP_SECRET?.trim();
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) return Response.json({ error: { code: "FORBIDDEN", message: "Forbidden." } }, { status: 403 });
  return toSuccessResponse({ released: await releaseExpiredCheckoutReservations(200) });
}
