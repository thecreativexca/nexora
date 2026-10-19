import { z } from "zod";

import { POS_PAYMENT_METHODS, POS_SALE_PAYMENT_METHODS } from "@/lib/constants/order";
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

/** Optional image URL. Accepts http(s) URLs OR server-relative GridFS paths. */
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

export const splitPaymentEntrySchema = z.object({
  paymentMethod: z.enum(POS_PAYMENT_METHODS),
  amountInPaise: paiseAmountSchema.positive("Payment amount must be greater than zero."),
  referenceNumber: z.string().trim().max(100).optional().default(""),
  notes: z.string().trim().max(500).optional().default(""),
});

export const posSaleRequestSchema = z
  .object({
    items: z
      .array(cartLineInputSchema)
      .min(1, "The current sale is empty.")
      .max(POS_MAX_CART_LINES, `A sale can hold at most ${POS_MAX_CART_LINES} different items.`),
    customerId: z
      .union([z.literal(""), objectIdSchema])
      .optional()
      .transform((val) => (val ? val : undefined)),
    customerName: optionalTextSchema(120)
      .refine((value) => value === "" || value.length >= 2, "Name is too short.")
      .optional()
      .default(""),
    customerEmail: z
      .union([z.literal(""), z.string().trim().max(254).regex(EMAIL_PATTERN, "Enter a valid email address.")])
      .optional()
      .default(""),
    customerPhone: z.string().trim().max(24).optional().default(""),
    paymentMethod: z.enum(POS_SALE_PAYMENT_METHODS),
    splitPayments: z.array(splitPaymentEntrySchema).optional(),
    discountInPaise: paiseAmountSchema.optional().default(0),
    cashReceivedInPaise: z
      .number()
      .int("Cash received must be a whole number of paise.")
      .min(0, "Cash received cannot be negative.")
      .max(MAX_PAISE, "Cash received amount is too large.")
      .optional()
      .default(0),
    referenceNumber: z.string().trim().max(100).optional().default(""),
    paymentDate: z.string().datetime({ offset: true }).optional(),
    paymentNotes: z.string().trim().max(500).optional().default(""),
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
 * Inventory management & Product CRUD
 * ------------------------------------------------------------------------- */

export const inventoryQuerySchema = z.object({
  q: z.string().trim().max(60).optional(),
  categoryId: z.string().trim().regex(OBJECT_ID_PATTERN, "Invalid category.").optional(),
  active: z.enum(["true", "false"]).optional(),
  type: z.enum(["physical", "service"]).optional(),
  featured: z.enum(["true", "false"]).optional(),
  lowStockOnly: z.enum(["true", "false"]).optional(),
  page: z.string().regex(/^\d{1,4}$/, "Page must be a positive number.").optional(),
  pageSize: z.string().regex(/^\d{1,3}$/, "Page size must be a positive number.").optional(),
});

const productBaseFields = {
  name: z.string().trim().min(2, "Product name is required.").max(160, "Name is too long."),
  description: z.string().trim().max(2000, "This value is too long.").optional(),
  sku: z.string().trim().min(2, "SKU is required.").max(40, "SKU is too long."),
  barcode: z.string().trim().max(60).optional(),
  priceInPaise: paiseAmountSchema,
  costInPaise: paiseAmountSchema.optional(),
  mrpInPaise: paiseAmountSchema.optional(),
  taxRate: z.number().min(0).max(100).optional().default(0),
  unit: z.string().trim().max(30).optional().default("Piece"),
  minStockThreshold: z.number().int().min(0).max(100000).optional().default(5),
  stock: stockLevelSchema,
  category: objectIdSchema,
  supplier: z
    .union([z.literal(""), objectIdSchema])
    .optional()
    .transform((val) => (val ? val : undefined)),
  image: productImageUrlSchema.optional(),
  isActive: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  isService: z.boolean().optional(),
} as const;

export const inventoryProductCreateSchema = z.object({
  ...productBaseFields,
  costInPaise: paiseAmountSchema.optional(),
  mrpInPaise: paiseAmountSchema.optional(),
  taxRate: z.number().min(0).max(100).optional().default(0),
  unit: z.string().trim().max(30).optional().default("Piece"),
  minStockThreshold: z.number().int().min(0).max(100000).optional().default(5),
  stock: stockLevelSchema.optional(),
  image: productImageUrlSchema.optional(),
  isActive: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  isService: z.boolean().optional(),
});

export type InventoryProductCreate = z.output<typeof inventoryProductCreateSchema>;

export const inventoryProductUpdateSchema = z
  .object({
    name: productBaseFields.name.optional(),
    description: productBaseFields.description.optional(),
    sku: productBaseFields.sku.optional(),
    barcode: productBaseFields.barcode.optional(),
    priceInPaise: productBaseFields.priceInPaise.optional(),
    costInPaise: productBaseFields.costInPaise.optional(),
    mrpInPaise: productBaseFields.mrpInPaise.optional(),
    taxRate: z.number().min(0).max(100).optional(),
    unit: z.string().trim().max(30).optional(),
    minStockThreshold: z.number().int().min(0).max(100000).optional(),
    stock: productBaseFields.stock.optional(),
    category: productBaseFields.category.optional(),
    supplier: productBaseFields.supplier.optional(),
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

/* ---------------------------------------------------------------------------
 * Stock Adjustments
 * ------------------------------------------------------------------------- */

export const stockAdjustmentSchema = z.object({
  productId: objectIdSchema,
  quantityChange: z.number().int("Quantity must be a whole number.").refine((val) => val !== 0, "Quantity change cannot be zero."),
  reason: z.string().trim().min(3, "Please provide a reason for the adjustment.").max(500),
});

export type StockAdjustmentInput = z.output<typeof stockAdjustmentSchema>;

/* ---------------------------------------------------------------------------
 * Category management
 * ------------------------------------------------------------------------- */

export const categoryCreateSchema = z.object({
  name: z.string().trim().min(2, "Category name is required.").max(80),
  description: z.string().trim().max(500).optional(),
  image: z.string().trim().max(1000).optional(),
});

export const categoryUpdateSchema = z.object({
  name: z.string().trim().min(2, "Category name is required.").max(80).optional(),
  description: z.string().trim().max(500).optional(),
  image: z.string().trim().max(1000).optional(),
  isActive: z.boolean().optional(),
});

/* ---------------------------------------------------------------------------
 * Supplier management
 * ------------------------------------------------------------------------- */

export const supplierCreateSchema = z.object({
  name: z.string().trim().min(2, "Supplier name is required.").max(120),
  businessName: z.string().trim().min(2, "Business name is required.").max(160),
  contactPerson: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().max(254).optional(),
  gstin: z.string().trim().max(20).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const supplierUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  businessName: z.string().trim().min(2).max(160).optional(),
  contactPerson: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().max(254).optional(),
  gstin: z.string().trim().max(20).optional(),
  notes: z.string().trim().max(1000).optional(),
  isActive: z.boolean().optional(),
});

/* ---------------------------------------------------------------------------
 * Purchase order management
 * ------------------------------------------------------------------------- */

export const purchaseOrderCreateSchema = z.object({
  supplierId: objectIdSchema,
  items: z.array(
    z.object({
      productId: objectIdSchema,
      orderedQuantity: z.number().int().min(1, "Quantity must be at least 1."),
      unitCostInPaise: paiseAmountSchema,
    }),
  ).min(1, "Select at least one product."),
  taxInPaise: paiseAmountSchema.optional().default(0),
  notes: z.string().trim().max(1000).optional(),
  status: z.enum(["DRAFT", "PENDING_APPROVAL"]).optional(),
});

export const purchaseOrderReceiveSchema = z.object({
  receiptItems: z.array(
    z.object({
      productId: objectIdSchema,
      quantityAccepted: z.number().int().min(0),
      quantityRejected: z.number().int().min(0).optional().default(0),
      notes: z.string().trim().max(200).optional(),
    }),
  ).min(1, "Specify at least one item to receive."),
  notes: z.string().trim().max(500).optional(),
});

export const purchaseOrderPaymentSchema = z.object({
  amountInPaise: paiseAmountSchema.positive("Payment amount must be greater than zero."),
  paymentMethod: z.string().trim().min(2).max(50),
  referenceNumber: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(500).optional(),
});

/* ---------------------------------------------------------------------------
 * Sales Returns & Exchanges
 * ------------------------------------------------------------------------- */

export const salesReturnSchema = z.object({
  items: z.array(
    z.object({
      productId: objectIdSchema,
      quantity: z.number().int().min(1, "Return quantity must be at least 1."),
      condition: z.enum(["sellable", "damaged"]),
      reason: z.string().trim().max(300).optional(),
    }),
  ).min(1, "Select at least one item to return."),
  refundMethod: z.enum(POS_PAYMENT_METHODS),
  referenceNumber: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(500).optional(),
});
