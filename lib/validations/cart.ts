import { z } from "zod";

import { MAX_CART_LINES } from "@/lib/constants/catalog";
import { objectIdSchema, quantitySchema } from "@/lib/validations/common";
import type { CartLine } from "@/types/cart";

/** Minimal, trustworthy payload: the browser only sends ids + quantities. */
export const cartLineInputSchema = z.object({
  productId: objectIdSchema,
  quantity: quantitySchema,
});

export const cartValidateRequestSchema = z.object({
  lines: z
    .array(cartLineInputSchema)
    .min(1, "Your bag is empty.")
    .max(MAX_CART_LINES, `A bag can hold at most ${MAX_CART_LINES} different items.`),
});

export type CartValidateRequest = z.infer<typeof cartValidateRequestSchema>;

/**
 * Shape of what we persist in localStorage. It is treated as untrusted input
 * and re-validated on every hydration - a tampered bag simply loses its
 * invalid lines instead of breaking the app.
 */
export const storedCartLineSchema = z.object({
  productId: objectIdSchema,
  quantity: quantitySchema,
  slug: z.string().max(200).default(""),
  name: z.string().trim().min(1).max(200),
  image: z.string().max(1000).default(""),
  unitPriceInPaise: z.number().int().min(0).max(1_000_000_000),
  isService: z.boolean().default(false),
  stockLimit: z.number().int().min(0).max(1_000_000).nullable().default(null),
  addedAt: z.number().int().min(0),
});

export const storedCartSchema = z.array(storedCartLineSchema).max(MAX_CART_LINES);

export function parseStoredCart(raw: string | null): CartLine[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    const result = storedCartSchema.safeParse(parsed);
    if (!result.success) return [];
    return result.data.map((line) => ({ ...line }));
  } catch {
    return [];
  }
}
