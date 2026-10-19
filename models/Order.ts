import mongoose, { Schema, type Model, type Types } from "mongoose";

import {
  ORDER_CHANNEL,
  ORDER_CHANNEL_VALUES,
  ORDER_NUMBER_PREFIX,
  ORDER_STATUS,
  ORDER_STATUS_VALUES,
  PAYMENT_METHOD,
  PAYMENT_METHOD_VALUES,
  PAYMENT_STATUS,
  PAYMENT_STATUS_VALUES,
  REFUND_STATUS,
  REFUND_STATUS_VALUES,
  type OrderChannel,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus,
  type RefundStatus,
} from "@/lib/constants/order";
import { CUSTOMER_MODEL, STAFF_PROFILE_MODEL } from "@/lib/constants/staff";
import {
  addressSubSchema,
  paiseField,
  positiveIntegerField,
  type AddressFields,
} from "@/models/schema-helpers";

export type OrderAddress = AddressFields;

/**
 * Historical snapshot of a purchased line.
 *
 * Product names, prices and SKUs are copied into the order so a later catalogue
 * change can never rewrite history.
 */
export interface OrderItemSnapshot {
  productId: Types.ObjectId;
  productName: string;
  sku: string;
  image: string;
  quantity: number;
  unitPriceInPaise: number;
  lineTotalInPaise: number;
  taxRate?: number;
  taxInPaise?: number;
  discountInPaise?: number;
  unit?: string;
  isService: boolean;
  returnedQuantity?: number;
}

/** Offline refund record. Each refund is immutable once recorded. */
export interface OrderRefund {
  amountInPaise: number;
  reason: string;
  refundMethod: PaymentMethod;
  status: RefundStatus;
  referenceNumber: string;
  processedByStaffId: Types.ObjectId | null;
  processedAt: Date | null;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

/** A single offline payment entry. Orders can have multiple payments (partial/split). */
export interface OrderPaymentEntry {
  paymentMethod: PaymentMethod;
  amountInPaise: number;
  referenceNumber: string;
  paymentDate: Date;
  verifiedByStaffId: Types.ObjectId | null;
  verifiedByName: string;
  notes: string;
  createdAt: Date;
}

export interface OrderDocument {
  orderNumber: string;
  channel: OrderChannel;
  status: OrderStatus;
  /** Primary/default payment method. For split payments, see paymentEntries. */
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  /**
   * Total amount paid (sum of all paymentEntries).
   * Stored as integer paise for decimal-safe arithmetic.
   */
  amountPaidInPaise: number;
  /** Cash change returned to customer on cash transactions. */
  changeInPaise?: number;
  /**
   * Legacy PayPal order ID - read-only for historical records.
   * @deprecated Use paymentEntries for new offline payments.
   */
  paypalOrderId?: string | null;
  /**
   * Legacy PayPal capture ID - read-only for historical records.
   * @deprecated Use paymentEntries for new offline payments.
   */
  paypalCaptureId?: string | null;
  currency: string;
  customerId: Types.ObjectId | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  deliveryAddress: OrderAddress;
  items: OrderItemSnapshot[];
  subtotalInPaise: number;
  discountInPaise: number;
  taxInPaise: number;
  totalInPaise: number;
  refundedTotalInPaise: number;
  refunds: OrderRefund[];
  /** Offline payment entries (supports partial/split payments). */
  paymentEntries: OrderPaymentEntry[];
  /** Client-provided key for POS sale idempotency; null for online orders. */
  idempotencyKey: string | null;
  notes: string;
  placedByStaffId: Types.ObjectId | null;
  /** Staff name snapshot for receipts/audits - survives later profile changes. */
  placedByName: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Historical delivery snapshot - never linked to a live customer address row. */
const deliveryAddressSchema = addressSubSchema();

/**
 * Customer identity is mandatory for ONLINE orders. In-store counter sales can
 * be anonymous walk-ins, so name/email/phone/address are only required when the
 * channel is ONLINE - POS sales store empty strings / no address instead.
 */
function requiresCustomerIdentity(this: { channel?: string }): boolean {
  return this.channel !== ORDER_CHANNEL.IN_STORE;
}

const orderItemSchema = new Schema<OrderItemSnapshot>(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    productName: { type: String, required: true, trim: true, maxlength: 160 },
    sku: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
    image: { type: String, trim: true, default: "" },
    quantity: positiveIntegerField(),
    unitPriceInPaise: paiseField(),
    lineTotalInPaise: paiseField(),
    taxRate: { type: Number, default: 0 },
    taxInPaise: paiseField({ required: false, default: 0 }),
    discountInPaise: paiseField({ required: false, default: 0 }),
    unit: { type: String, trim: true, default: "Piece" },
    isService: { type: Boolean, default: false },
    returnedQuantity: { type: Number, default: 0 },
  },
  { _id: false },
);

const refundSchema = new Schema<OrderRefund>(
  {
    amountInPaise: paiseField(),
    reason: { type: String, trim: true, default: "", maxlength: 500 },
    refundMethod: {
      type: String,
      enum: PAYMENT_METHOD_VALUES,
      default: PAYMENT_METHOD.CASH,
      required: true,
    },
    status: {
      type: String,
      enum: REFUND_STATUS_VALUES,
      default: REFUND_STATUS.REQUESTED,
      required: true,
    },
    referenceNumber: { type: String, trim: true, default: "", maxlength: 100 },
    processedByStaffId: {
      type: Schema.Types.ObjectId,
      ref: STAFF_PROFILE_MODEL,
      default: null,
    },
    processedAt: { type: Date, default: null },
    notes: { type: String, trim: true, default: "", maxlength: 500 },
  },
  { timestamps: true, versionKey: false },
);

const paymentEntrySchema = new Schema<OrderPaymentEntry>(
  {
    paymentMethod: {
      type: String,
      enum: PAYMENT_METHOD_VALUES,
      required: true,
    },
    amountInPaise: paiseField(),
    referenceNumber: { type: String, trim: true, default: "", maxlength: 100 },
    paymentDate: { type: Date, required: true, default: Date.now },
    verifiedByStaffId: {
      type: Schema.Types.ObjectId,
      ref: STAFF_PROFILE_MODEL,
      default: null,
    },
    verifiedByName: { type: String, trim: true, default: "", maxlength: 120 },
    notes: { type: String, trim: true, default: "", maxlength: 500 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true, versionKey: false },
);

const orderSchema = new Schema<OrderDocument>(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      maxlength: 32,
      default: () => `${ORDER_NUMBER_PREFIX}-PENDING`,
    },
    channel: {
      type: String,
      enum: ORDER_CHANNEL_VALUES,
      required: true,
      default: ORDER_CHANNEL.ONLINE,
    },
    status: {
      type: String,
      enum: ORDER_STATUS_VALUES,
      required: true,
      default: ORDER_STATUS.ORDER_PLACED,
    },
    paymentMethod: {
      type: String,
      enum: PAYMENT_METHOD_VALUES,
      required: true,
      default: PAYMENT_METHOD.CASH,
    },
    paymentStatus: {
      type: String,
      enum: PAYMENT_STATUS_VALUES,
      required: true,
      default: PAYMENT_STATUS.UNPAID,
    },
    amountPaidInPaise: paiseField({ required: false, default: 0 }),
    changeInPaise: paiseField({ required: false, default: 0 }),
    // Omit legacy gateway identifiers on new offline orders. A sparse unique
    // index still treats explicit `null` as an indexed value, which would make
    // the second offline order fail with a duplicate-key error.
    paypalOrderId: { type: String, trim: true },
    paypalCaptureId: { type: String, trim: true },
    currency: { type: String, trim: true, uppercase: true, default: "INR", maxlength: 3 },
    /** Reserved for customer accounts; guest orders leave it null. */
    customerId: {
      type: Schema.Types.ObjectId,
      ref: CUSTOMER_MODEL,
      default: null,
    },
    customerName: {
      type: String,
      required: [requiresCustomerIdentity, "Customer name is required."],
      trim: true,
      maxlength: 120,
      default: "",
    },
    customerEmail: {
      type: String,
      required: [requiresCustomerIdentity, "Customer email is required."],
      trim: true,
      lowercase: true,
      maxlength: 254,
      default: "",
    },
    customerPhone: {
      type: String,
      required: [requiresCustomerIdentity, "Customer phone is required."],
      trim: true,
      maxlength: 24,
      default: "",
    },
    deliveryAddress: {
      type: deliveryAddressSchema,
      required: [requiresCustomerIdentity, "A delivery address is required for online orders."],
    },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: (items: OrderItemSnapshot[]) => items.length > 0,
        message: "An order must contain at least one item.",
      },
    },
    subtotalInPaise: paiseField(),
    discountInPaise: paiseField({ required: false, default: 0 }),
    taxInPaise: paiseField({ required: false, default: 0 }),
    totalInPaise: paiseField(),
    refundedTotalInPaise: paiseField({ required: false, default: 0 }),
    refunds: { type: [refundSchema], default: [] },
    paymentEntries: { type: [paymentEntrySchema], default: [] },
    /**
     * Unique client-supplied key (POS only) that makes a network retry replay
     * the existing sale instead of charging twice. Null for online orders.
     */
    idempotencyKey: { type: String, trim: true, minlength: 8, maxlength: 100 },
    notes: { type: String, trim: true, default: "", maxlength: 1000 },
    /** Set when an in-store (POS) sale is taken by a staff member. */
    placedByStaffId: {
      type: Schema.Types.ObjectId,
      ref: STAFF_PROFILE_MODEL,
      default: null,
    },
    /** Staff name snapshot for receipts/audits - survives later profile changes. */
    placedByName: { type: String, trim: true, default: "", maxlength: 120 },
  },
  { timestamps: true, versionKey: false },
);

/** Order management screens (Phase 2+): channel + status queues. */
orderSchema.index({ channel: 1, status: 1, createdAt: -1 });
/** Phase 5 orders portal: channel-only filter ("All in-store", "All online"). */
orderSchema.index({ channel: 1, createdAt: -1 });
/** Phase 5 orders portal: status-only filter (e.g. "Refunded"). */
orderSchema.index({ status: 1, createdAt: -1 });
/** Customer account order history - newest first, scoped to the owner. */
orderSchema.index({ customerId: 1, createdAt: -1 });
/** Guest order lookups / support by email. */
orderSchema.index({ customerEmail: 1, createdAt: -1 });
/** Latest orders. */
orderSchema.index({ createdAt: -1 });
/** "Which orders contain this product?" - refunds / recalls. */
orderSchema.index({ "items.productId": 1 });
/** Staff-served POS sales - receipts / shift reporting (Phase 4+). */
orderSchema.index({ placedByStaffId: 1, createdAt: -1 });
/** Idempotent POS sale replays (Phase 4) filter by the client key. */
orderSchema.index({ idempotencyKey: 1 }, { sparse: true, unique: true });
/** Payment status queries for outstanding dues. */
orderSchema.index({ paymentStatus: 1, createdAt: -1 });
/** Legacy PayPal lookups - kept sparse so old records are still found. */
orderSchema.index({ paypalOrderId: 1 }, { sparse: true, unique: true });
orderSchema.index({ paypalCaptureId: 1 }, { sparse: true, unique: true });

export const Order: Model<OrderDocument> =
  (mongoose.models.Order as Model<OrderDocument> | undefined) ??
  mongoose.model<OrderDocument>("Order", orderSchema);

export default Order;
