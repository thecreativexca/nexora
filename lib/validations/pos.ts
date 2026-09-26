import { z } from "zod";

import { POS_PAYMENT_METHODS } from "@/lib/constants/order";
import {
  POS_IDEMPOTENCY_KEY_MAX_LENGTH,
  POS_IDEMPOTENCY_KEY_MIN_LENGTH,
  POS_MAX_CART_LINES,
} from "@/lib/constants/pos";
import { cartLineInputSchema } from "@/lib/validations/cart";
import {
  EMAIL_PATTERN,
  OBJECT_ID_PATTERN,
  objectIdSchema,
  optionalTextSchema,
} from "@/lib/validations/common";

/**
 * Server-side POS + inventory validation. The browser is never trusted: prices,
 * totals and stock are re-read from MongoDB, and money is always an integer
 * number of paise.
 */

const MAX_PAISE = 999_999_999_99;
const MAX_STOCK = 1_000_000;

/** Whole paise amount, 0..MAX_PAISE, rejecting NaN/drift/negative values. */
export const paiseAmountSchema = z
  .number()
  .int("Price must be a whole amount of paise.")
  .min(0, "Amount cannot be negative.")
  .max(MAX_PAISE, "Amount is too large.");

export const stockLevelSchema = z
  .number()
  .int("Stock must be a whole number.")
  .min(0, "Stock cannot be negative.")
  .max(MAX_STOCK, "Stock is too large.");

/** Optional image URL. Accepts http(s) URLs OR server-relative GridFS paths
 * (`/api/pos/images/<objectId>`) produced by the product image uploader.
 * Empty string removes/omits the image. */
export const productImageUrlSchema = z
  .union([
    z.literal(""),
    z
      .string()
      .trim()
      .max(1000)
      .regex(
        /^\/api\/pos\/images\/[a-f0-9]{24}$/,
        "Enter a valid image URL (https://, http:// or an uploaded image).",
      ),
    z.string().trim().max(1000),
  ])
  .refine((value) => {
    if (!value) return true;
    if (value.startsWith("/api/pos/images/")) return true;
    try {
      const parsed = new URL(value);
      return parsed.protocol === "https:" || parsed.protocol === "http:";
    } catch {
      return false;
    }
  }, "Enter a valid image URL (https:// or http://).");

export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(POS_IDEMPOTENCY_KEY_MIN_LENGTH, "Invalid sale key.")
  .max(POS_IDEMPOTENCY_KEY_MAX_LENGTH, "Invalid sale key.");

/* ---------------------------------------------------------------------------
 * POS register
 * ------------------------------------------------------------------------- */

export const posSaleRequestSchema = z.object({
  items: z
    .array(cartLineInputSchema)
    .min(1, "The current sale is empty.")
    .max(POS_MAX_CART_LINES, `A sale can hold at most ${POS_MAX_CART_LINES} different items.`),
  customerName: optionalTextSchema(120)
    .refine((value) => value === "" || value.length >= 2, "Name is too short.")
    .optional()
    .default(""),
  customerEmail: z
    .union([z.literal(""), z.string().trim().max(254).regex(EMAIL_PATTERN, "Enter a valid email address.")])
    .optional()
    .default(""),
  paymentMethod: z.enum(POS_PAYMENT_METHODS),
  idempotencyKey: idempotencyKeySchema.optional(),
});

export type PosSaleRequest = z.output<typeof posSaleRequestSchema>;

/** Query for the register product grid (all values arrive as strings). */
export const posProductQuerySchema = z.object({
  q: z.string().trim().max(60).optional(),
  categoryId: z.string().trim().regex(OBJECT_ID_PATTERN, "Invalid category.").optional(),
  page: z.string().regex(/^\d{1,4}$/, "Page must be a positive number.").optional(),
  pageSize: z.string().regex(/^\d{1,3}$/, "Page size must be a positive number.").optional(),
});

/* ---------------------------------------------------------------------------
 * Inventory management
 * ------------------------------------------------------------------------- */

export const inventoryQuerySchema = z.object({
  q: z.string().trim().max(60).optional(),
  categoryId: z.string().trim().regex(OBJECT_ID_PATTERN, "Invalid category.").optional(),
  active: z.enum(["true", "false"]).optional(),
  type: z.enum(["physical", "service"]).optional(),
  featured: z.enum(["true", "false"]).optional(),
  page: z.string().regex(/^\d{1,4}$/, "Page must be a positive number.").optional(),
  pageSize: z.string().regex(/^\d{1,3}$/, "Page size must be a positive number.").optional(),
});

const productBaseFields = {
  name: z.string().trim().min(2, "Product name is required.").max(160, "Name is too long."),
  description: z.string().trim().max(2000, "This value is too long.").optional(),
  sku: z.string().trim().min(2, "SKU is required.").max(40, "SKU is too long."),
  priceInPaise: paiseAmountSchema,
  costInPaise: paiseAmountSchema.optional(),
  stock: stockLevelSchema,
  category: objectIdSchema,
  image: productImageUrlSchema.optional(),
  isActive: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  isService: z.boolean().optional(),
} as const;

export const inventoryProductCreateSchema = z.object({
  ...productBaseFields,
  costInPaise: paiseAmountSchema.optional(),
  stock: stockLevelSchema.optional(),
  image: productImageUrlSchema.optional(),
  isActive: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  isService: z.boolean().optional(),
});

export type InventoryProductCreate = z.output<typeof inventoryProductCreateSchema>;

/**
 * Update schema: every field is optional and only fields the caller actually
 * supplied are written (targeted updates) - stale values can never overwrite
 * the stock a cashier changed meanwhile.
 */
export const inventoryProductUpdateSchema = z
  .object({
    name: productBaseFields.name.optional(),
    description: productBaseFields.description.optional(),
    sku: productBaseFields.sku.optional(),
    priceInPaise: productBaseFields.priceInPaise.optional(),
    costInPaise: productBaseFields.costInPaise.optional(),
    stock: productBaseFields.stock.optional(),
    category: productBaseFields.category.optional(),
    image: productBaseFields.image.optional(),
    isActive: productBaseFields.isActive.optional(),
    isFeatured: productBaseFields.isFeatured.optional(),
    isService: productBaseFields.isService.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Nothing to update.",
    path: ["form"],
  });

export type InventoryProductUpdate = z.output<typeof inventoryProductUpdateSchema>;