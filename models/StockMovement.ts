import mongoose, { Schema, type Model, type Types } from "mongoose";

import { STAFF_PROFILE_MODEL } from "@/lib/constants/staff";

export const STOCK_MOVEMENT_TYPE = {
  SALE: "SALE",
  PURCHASE_RECEIPT: "PURCHASE_RECEIPT",
  ADJUSTMENT: "ADJUSTMENT",
  RETURN_RESTOCK: "RETURN_RESTOCK",
  DAMAGED: "DAMAGED",
  PURCHASE_RETURN: "PURCHASE_RETURN",
} as const;

export type StockMovementType =
  (typeof STOCK_MOVEMENT_TYPE)[keyof typeof STOCK_MOVEMENT_TYPE];

export const STOCK_MOVEMENT_TYPE_VALUES = Object.values(
  STOCK_MOVEMENT_TYPE,
) as StockMovementType[];

export interface StockMovementDocument {
  productId: Types.ObjectId;
  productName: string;
  sku: string;
  storeId?: string | null;
  movementType: StockMovementType;
  quantityChange: number;
  quantityBefore: number;
  quantityAfter: number;
  referenceId?: string | null;
  referenceType?: string | null;
  reason: string;
  performedByStaffId?: Types.ObjectId | null;
  performedByName: string;
  createdAt: Date;
  updatedAt: Date;
}

const stockMovementSchema = new Schema<StockMovementDocument>(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    productName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    sku: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 40,
      index: true,
    },
    storeId: { type: String, default: null },
    movementType: {
      type: String,
      enum: STOCK_MOVEMENT_TYPE_VALUES,
      required: true,
      index: true,
    },
    quantityChange: { type: Number, required: true },
    quantityBefore: { type: Number, required: true },
    quantityAfter: { type: Number, required: true },
    referenceId: { type: String, trim: true, default: null, index: true },
    referenceType: { type: String, trim: true, default: null },
    reason: { type: String, trim: true, default: "", maxlength: 500 },
    performedByStaffId: {
      type: Schema.Types.ObjectId,
      ref: STAFF_PROFILE_MODEL,
      default: null,
    },
    performedByName: {
      type: String,
      required: true,
      trim: true,
      default: "System",
      maxlength: 120,
    },
  },
  { timestamps: true, versionKey: false },
);

stockMovementSchema.index({ productId: 1, createdAt: -1 });
stockMovementSchema.index({ sku: 1, createdAt: -1 });
stockMovementSchema.index({ movementType: 1, createdAt: -1 });

export const StockMovement: Model<StockMovementDocument> =
  (mongoose.models.StockMovement as Model<StockMovementDocument> | undefined) ??
  mongoose.model<StockMovementDocument>("StockMovement", stockMovementSchema);

export default StockMovement;
