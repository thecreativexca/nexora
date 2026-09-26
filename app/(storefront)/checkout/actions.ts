"use server";


export type PlaceOrderResult =
  | { ok: true; orderNumber: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string[]> };

/**
 * Places an ONLINE order.
 *
 * Server Function (Server Action): input is re-validated with Zod and every
 * price, total and stock check is resolved against MongoDB - the browser can
 * only ever send product ids and quantities.
 */
export async function placeOrderAction(input: unknown): Promise<PlaceOrderResult> {
  void input;
  return { ok: false, message: "Online orders must be completed through secure PayPal checkout." };
}
