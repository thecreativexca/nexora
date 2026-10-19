"use server";

import { getCurrentCustomerId } from "@/lib/auth/customer-session";
import { createOnlineOrder } from "@/lib/services/order.service";
import { checkoutSchema } from "@/lib/validations/order";
import { isAppError } from "@/lib/utils/errors";

export type PlaceOrderResult =
  | { ok: true; orderNumber: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string[]> };

/**
 * Places an ONLINE order with UNPAID status.
 *
 * Server Function (Server Action): input is re-validated with Zod and every
 * price, total and stock check is resolved against MongoDB - the browser can
 * only ever send product ids and quantities.
 *
 * Payment is NOT collected here. The order is placed as UNPAID and staff
 * will record payment manually after offline collection (pay at store,
 * cash on delivery, UPI, etc.).
 */
export async function placeOrderAction(input: unknown): Promise<PlaceOrderResult> {
  // Validate the incoming payload server-side — never trust the browser.
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "form";
      if (!fieldErrors[key]) fieldErrors[key] = [];
      fieldErrors[key].push(issue.message);
    }
    return {
      ok: false,
      message: "Please correct the highlighted fields before placing the order.",
      fieldErrors,
    };
  }

  try {
    const customerId = await getCurrentCustomerId();
    const order = await createOnlineOrder(parsed.data, customerId);
    return { ok: true, orderNumber: order.orderNumber };
  } catch (error) {
    if (isAppError(error)) {
      return { ok: false, message: (error as Error).message };
    }
    return {
      ok: false,
      message: "We could not place your order right now. Please try again.",
    };
  }
}
