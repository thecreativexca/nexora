import mongoose, { Schema, type Model, type Types } from "mongoose";

import { nonNegativeIntegerField, paiseField } from "@/models/schema-helpers";

export interface ProductDocument {
  name: string;
  slug: string;
  description: string;
  priceInPaise: number;
  costInPaise: number;
  mrpInPaise: number;
  taxRate: number;
  unit: string;
  minStockThreshold: number;
  sku: string;
  barcode?: string;
  barcodeFormat?: "CODE128" | "EAN13" | "UPCA";
  brand?: string;
  deviceModel?: string;
  caseColor?: string;
  stock: number;
  category: Types.ObjectId;
  supplier?: Types.ObjectId | null;
  image: string;
  images: string[];
  isActive: boolean;
  isFeatured: boolean;
  isService: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const productSchema = new Schema<ProductDocument>(
  {
    name: {
      type: String,
      required: [true, "Product name is required."],
      trim: true,
      maxlength: 160,
    },
    slug: {
      type: String,
      required: [true, "Product slug is required."],
      trim: true,
      lowercase: true,
      unique: true,
      maxlength: 160,
    },
    description: { type: String, trim: true, default: "", maxlength: 2000 },
    priceInPaise: paiseField(),
    costInPaise: paiseField({ required: false, default: 0 }),
    mrpInPaise: paiseField({ required: false, default: 0 }),
    /** Tax rate percentage (e.g. 0, 5, 12, 18, 28) */
    taxRate: { type: Number, default: 0, min: 0, max: 100 },
    /** Unit of measurement (Piece, Box, Pack, Kg, Gram, Liter, Meter) */
    unit: { type: String, trim: true, default: "Piece", maxlength: 30 },
    /** Low stock alert threshold */
    minStockThreshold: nonNegativeIntegerField({ default: 5 }),
    sku: {
      type: String,
      required: [true, "SKU is required."],
      trim: true,
      uppercase: true,
      unique: true,
      maxlength: 40,
    },
    /** Barcode for hardware scanner / fast checkout (sparse unique) */
    barcode: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 60,
    },
    barcodeFormat: {
      type: String,
      enum: ["CODE128", "EAN13", "UPCA"],
      default: "CODE128",
    },
    /** Optional variant identity. Each combination remains its own SKU/stock row. */
    brand: { type: String, trim: true, default: "", maxlength: 80 },
    deviceModel: { type: String, trim: true, default: "", maxlength: 120 },
    caseColor: { type: String, trim: true, default: "", maxlength: 60 },
    /**
     * Available physical inventory.
     */
    stock: nonNegativeIntegerField({ default: 0 }),
    category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: [true, "Product category is required."],
    },
    supplier: {
      type: Schema.Types.ObjectId,
      ref: "Supplier",
      default: null,
    },
    image: { type: String, trim: true, default: "" },
    images: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    /**
     * Business rule: when `isService` is false, `stock` controls availability.
     * When true, the product (a service) stays purchasable even at stock 0 and
     * checkout never decrements inventory for it.
     */
    isService: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false },
);

/** Category browsing + default listing order. */
productSchema.index({ isActive: 1, category: 1, createdAt: -1 });
/** Homepage featured shelf. */
productSchema.index({ isActive: 1, isFeatured: 1, createdAt: -1 });
/** Price sorting / price range filters. */
productSchema.index({ isActive: 1, priceInPaise: 1 });
/** Barcode lookup index. */
productSchema.index({ barcode: 1 }, { unique: true, sparse: true });
productSchema.index({ brand: 1, deviceModel: 1, caseColor: 1 });
/** Low stock query index. */
productSchema.index({ isActive: 1, isService: 1, stock: 1, minStockThreshold: 1 });

export const Product: Model<ProductDocument> =
  (mongoose.models.Product as Model<ProductDocument> | undefined) ??
  mongoose.model<ProductDocument>("Product", productSchema);

export default Product;
