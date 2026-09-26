import { z } from "zod";

import { MAX_CART_LINES } from "@/lib/constants/catalog";
import { ONLINE_CHECKOUT_PAYMENT_METHODS } from "@/lib/constants/order";
import {
  customerNameSchema,
  deliveryAddressSchema,
  emailSchema,
  optionalTextSchema,
  phoneSchema,
} from "@/lib/validations/common";
import { cartLineInputSchema } from "@/lib/validations/cart";

/**
 * Server-side checkout contract. The browser may send prices/totals, but this
 * schema deliberately ignores them: only ids + quantities are accepted, and the
 * order service re-reads every product from MongoDB.
 */
export const checkoutSchema = z.object({
  customerName: customerNameSchema,
  customerEmail: emailSchema,
  customerPhone: phoneSchema,
  address: deliveryAddressSchema,
  notes: optionalTextSchema(1000).optional().default(""),
  paymentMethod: z
    .enum(ONLINE_CHECKOUT_PAYMENT_METHODS)
    .optional()
    .default(ONLINE_CHECKOUT_PAYMENT_METHODS[0]),
  items: z
    .array(cartLineInputSchema)
    .min(1, "Your bag is empty.")
    .max(MAX_CART_LINES, `A bag can hold at most ${MAX_CART_LINES} different items.`),
});

export type CheckoutRequest = z.input<typeof checkoutSchema>;
export type CheckoutPayload = z.output<typeof checkoutSchema>;

export const paypalCaptureSchema = z.object({
  sessionId: z.string().uuid(),
  paypalOrderId: z.string().trim().min(8).max(64).regex(/^[A-Za-z0-9-]+$/),
});
export const paypalCancelSchema = paypalCaptureSchema;

