import mongoose, { Schema, type Model, type Types } from "mongoose";

import { nonNegativeIntegerField, paiseField } from "@/models/schema-helpers";

export interface ProductDocument {
  name: string;
  slug: string;
  description: string;
  priceInPaise: number;
  costInPaise: number;
  sku: string;
  stock: number;
  category: Types.ObjectId;
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
    sku: {
      type: String,
      required: [true, "SKU is required."],
      trim: true,
      uppercase: true,
      unique: true,
      maxlength: 40,
    },
    /**
     * Available physical inventory. A PayPal reservation atomically decrements
     * this value and restores it on cancellation/expiry. POS therefore sees the
     * same availability and cannot race an online checkout.
     */
    stock: nonNegativeIntegerField({ default: 0 }),
    category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: [true, "Product category is required."],
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

export const Product: Model<ProductDocument> =
  (mongoose.models.Product as Model<ProductDocument> | undefined) ??
  mongoose.model<ProductDocument>("Product", productSchema);

export default Product;
