import { z } from "zod";

import {
  POS_PAYMENT_METHODS,
  STOREFRONT_PAYMENT_METHODS,
} from "@/lib/constants/order";
import { MAX_CART_LINES } from "@/lib/constants/catalog";
import {
  customerNameSchema,
  deliveryAddressSchema,
  emailSchema,
  optionalTextSchema,
  phoneSchema,
} from "@/lib/validations/common";
import { cartLineInputSchema } from "@/lib/validations/cart";

/**
 * Server-side checkout contract for storefront orders.
 * The browser may send prices/totals, but this schema deliberately ignores
 * them: only ids + quantities are accepted, and the order service re-reads
 * every product from MongoDB.
 *
 * Online orders are created with UNPAID status and payment is recorded
 * manually by staff (Pay at Store / Cash on Delivery).
 */
export const checkoutSchema = z.object({
  customerName: customerNameSchema,
  customerEmail: emailSchema,
  customerPhone: phoneSchema,
  address: deliveryAddressSchema,
  notes: optionalTextSchema(1000).optional().default(""),
  paymentMethod: z
    .enum(STOREFRONT_PAYMENT_METHODS)
    .optional()
    .default(STOREFRONT_PAYMENT_METHODS[0]),
  items: z
    .array(cartLineInputSchema)
    .min(1, "Your bag is empty.")
    .max(MAX_CART_LINES, `A bag can hold at most ${MAX_CART_LINES} different items.`),
});

export type CheckoutRequest = z.input<typeof checkoutSchema>;
export type CheckoutPayload = z.output<typeof checkoutSchema>;

/**
 * Schema for recording a manual offline payment against a storefront order.
 * Staff use this to mark an order as paid after the customer pays in person.
 */
export const offlinePaymentSchema = z.object({
  orderNumber: z.string().trim().min(1).max(40),
  paymentMethod: z.enum(POS_PAYMENT_METHODS),
  amountInPaise: z
    .number()
    .int("Amount must be a whole number of paise.")
    .min(1, "Amount must be greater than zero.")
    .max(999_999_999_99, "Amount is too large."),
  referenceNumber: z.string().trim().max(100).optional().default(""),
  paymentDate: z.string().datetime().optional(),
  notes: z.string().trim().max(500).optional().default(""),
});

export type OfflinePaymentInput = z.output<typeof offlinePaymentSchema>;
