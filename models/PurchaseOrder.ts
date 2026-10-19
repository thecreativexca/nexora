import mongoose, { Schema, type Model, type Types } from "mongoose";

import { STAFF_PROFILE_MODEL } from "@/lib/constants/staff";
import { nonNegativeIntegerField, paiseField, positiveIntegerField } from "@/models/schema-helpers";

export const PURCHASE_ORDER_STATUS = {
  DRAFT: "DRAFT",
  PENDING_APPROVAL: "PENDING_APPROVAL",
  APPROVED: "APPROVED",
  PARTIALLY_RECEIVED: "PARTIALLY_RECEIVED",
  RECEIVED: "RECEIVED",
  CANCELLED: "CANCELLED",
} as const;

export type PurchaseOrderStatus =
  (typeof PURCHASE_ORDER_STATUS)[keyof typeof PURCHASE_ORDER_STATUS];

export const PURCHASE_ORDER_STATUS_VALUES = Object.values(
  PURCHASE_ORDER_STATUS,
) as PurchaseOrderStatus[];

export interface PurchaseOrderItemSnapshot {
  productId: Types.ObjectId;
  productName: string;
  sku: string;
  orderedQuantity: number;
  receivedQuantity: number;
  rejectedQuantity: number;
  unitCostInPaise: number;
  lineTotalInPaise: number;
}

export interface PurchaseOrderPayment {
  amountInPaise: number;
  paymentMethod: string;
  referenceNumber: string;
  paidAt: Date;
  notes: string;
  recordedByStaffId?: Types.ObjectId | null;
}

export interface PurchaseReceiptRecord {
  receiptDate: Date;
  receivedByStaffId?: Types.ObjectId | null;
  receivedByName: string;
  items: {
    productId: Types.ObjectId;
    quantityAccepted: number;
    quantityRejected: number;
    notes?: string;
  }[];
  notes: string;
  createdAt: Date;
}

export interface PurchaseOrderDocument {
  poNumber: string;
  supplierId: Types.ObjectId;
  supplierName: string;
  status: PurchaseOrderStatus;
  items: PurchaseOrderItemSnapshot[];
  subtotalInPaise: number;
  taxInPaise: number;
  totalInPaise: number;
  amountPaidInPaise: number;
  paymentStatus: "UNPAID" | "PARTIALLY_PAID" | "PAID";
  payments: PurchaseOrderPayment[];
  receiptHistory: PurchaseReceiptRecord[];
  notes: string;
  createdByStaffId?: Types.ObjectId | null;
  approvedByStaffId?: Types.ObjectId | null;
  cancelledByStaffId?: Types.ObjectId | null;
  cancellationReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const purchaseOrderItemSchema = new Schema<PurchaseOrderItemSnapshot>(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    productName: { type: String, required: true, trim: true, maxlength: 160 },
    sku: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
    orderedQuantity: positiveIntegerField(),
    receivedQuantity: nonNegativeIntegerField({ default: 0 }),
    rejectedQuantity: nonNegativeIntegerField({ default: 0 }),
    unitCostInPaise: paiseField(),
    lineTotalInPaise: paiseField(),
  },
  { _id: false },
);

const purchaseOrderPaymentSchema = new Schema<PurchaseOrderPayment>(
  {
    amountInPaise: paiseField(),
    paymentMethod: { type: String, required: true, trim: true, maxlength: 50 },
    referenceNumber: { type: String, trim: true, default: "", maxlength: 100 },
    paidAt: { type: Date, required: true, default: Date.now },
    notes: { type: String, trim: true, default: "", maxlength: 500 },
    recordedByStaffId: { type: Schema.Types.ObjectId, ref: STAFF_PROFILE_MODEL, default: null },
  },
  { _id: true },
);

const purchaseReceiptSchema = new Schema<PurchaseReceiptRecord>(
  {
    receiptDate: { type: Date, required: true, default: Date.now },
    receivedByStaffId: { type: Schema.Types.ObjectId, ref: STAFF_PROFILE_MODEL, default: null },
    receivedByName: { type: String, required: true, trim: true, maxlength: 120 },
    items: [
      {
        productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
        quantityAccepted: nonNegativeIntegerField({ default: 0 }),
        quantityRejected: nonNegativeIntegerField({ default: 0 }),
        notes: { type: String, trim: true, default: "", maxlength: 200 },
      },
    ],
    notes: { type: String, trim: true, default: "", maxlength: 500 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const purchaseOrderSchema = new Schema<PurchaseOrderDocument>(
  {
    poNumber: {
      type: String,
      required: [true, "PO Number is required."],
      trim: true,
      uppercase: true,
      maxlength: 40,
    },
    supplierId: {
      type: Schema.Types.ObjectId,
      ref: "Supplier",
      required: [true, "Supplier is required."],
    },
    supplierName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    status: {
      type: String,
      enum: PURCHASE_ORDER_STATUS_VALUES,
      default: PURCHASE_ORDER_STATUS.DRAFT,
      required: true,
      index: true,
    },
    items: [purchaseOrderItemSchema],
    subtotalInPaise: paiseField({ default: 0 }),
    taxInPaise: paiseField({ default: 0 }),
    totalInPaise: paiseField({ default: 0 }),
    amountPaidInPaise: paiseField({ default: 0 }),
    paymentStatus: {
      type: String,
      enum: ["UNPAID", "PARTIALLY_PAID", "PAID"],
      default: "UNPAID",
      required: true,
      index: true,
    },
    payments: [purchaseOrderPaymentSchema],
    receiptHistory: [purchaseReceiptSchema],
    notes: { type: String, trim: true, default: "", maxlength: 1000 },
    createdByStaffId: { type: Schema.Types.ObjectId, ref: STAFF_PROFILE_MODEL, default: null },
    approvedByStaffId: { type: Schema.Types.ObjectId, ref: STAFF_PROFILE_MODEL, default: null },
    cancelledByStaffId: { type: Schema.Types.ObjectId, ref: STAFF_PROFILE_MODEL, default: null },
    cancellationReason: { type: String, trim: true, default: null, maxlength: 500 },
  },
  { timestamps: true, versionKey: false },
);

purchaseOrderSchema.index({ poNumber: 1 }, { unique: true });
purchaseOrderSchema.index({ supplierId: 1, createdAt: -1 });
purchaseOrderSchema.index({ status: 1, createdAt: -1 });

export const PurchaseOrder: Model<PurchaseOrderDocument> =
  (mongoose.models.PurchaseOrder as Model<PurchaseOrderDocument> | undefined) ??
  mongoose.model<PurchaseOrderDocument>("PurchaseOrder", purchaseOrderSchema);

export default PurchaseOrder;
