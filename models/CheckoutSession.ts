import mongoose, { Schema, type Model, type Types } from "mongoose";

import { addressSubSchema, paiseField, positiveIntegerField, type AddressFields } from "@/models/schema-helpers";

export type CheckoutSessionStatus = "RESERVED" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED" | "EXPIRED";

export interface CheckoutSessionItem {
  productId: Types.ObjectId; productName: string; sku: string; image: string;
  quantity: number; unitPriceInPaise: number; lineTotalInPaise: number; isService: boolean;
}

export interface CheckoutSessionDocument {
  sessionId: string; customerId: Types.ObjectId | null; customerName: string;
  customerEmail: string; customerPhone: string; deliveryAddress: AddressFields;
  items: CheckoutSessionItem[]; subtotalInPaise: number; totalInPaise: number;
  currency: string; status: CheckoutSessionStatus; paypalOrderId: string | null;
  paypalCaptureId: string | null; orderId: Types.ObjectId | null; notes: string;
  expiresAt: Date; inventoryReleasedAt: Date | null; createdAt: Date; updatedAt: Date;
}

const itemSchema = new Schema<CheckoutSessionItem>({
  productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
  productName: { type: String, required: true }, sku: { type: String, required: true },
  image: { type: String, default: "" }, quantity: positiveIntegerField(),
  unitPriceInPaise: paiseField(), lineTotalInPaise: paiseField(),
  isService: { type: Boolean, default: false },
}, { _id: false });

const checkoutSessionSchema = new Schema<CheckoutSessionDocument>({
  sessionId: { type: String, required: true, unique: true },
  customerId: { type: Schema.Types.ObjectId, ref: "Customer", default: null },
  customerName: { type: String, required: true, trim: true },
  customerEmail: { type: String, required: true, trim: true, lowercase: true },
  customerPhone: { type: String, required: true, trim: true },
  deliveryAddress: { type: addressSubSchema(), required: true },
  items: { type: [itemSchema], required: true }, subtotalInPaise: paiseField(), totalInPaise: paiseField(),
  currency: { type: String, required: true, uppercase: true, maxlength: 3 },
  status: { type: String, enum: ["RESERVED", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED", "EXPIRED"], default: "RESERVED" },
  paypalOrderId: { type: String, default: null }, paypalCaptureId: { type: String, default: null },
  orderId: { type: Schema.Types.ObjectId, ref: "Order", default: null }, notes: { type: String, default: "" },
  expiresAt: { type: Date, required: true }, inventoryReleasedAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false });
checkoutSessionSchema.index({ paypalOrderId: 1 }, { unique: true, sparse: true });
checkoutSessionSchema.index({ paypalCaptureId: 1 }, { unique: true, sparse: true });
checkoutSessionSchema.index({ status: 1, expiresAt: 1 });
export const CheckoutSession: Model<CheckoutSessionDocument> = (mongoose.models.CheckoutSession as Model<CheckoutSessionDocument> | undefined) ?? mongoose.model<CheckoutSessionDocument>("CheckoutSession", checkoutSessionSchema);
