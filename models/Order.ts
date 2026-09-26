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
  isService: boolean;
}

/** Refund metadata foundation - the refund workflow ships in a later phase. */
export interface OrderRefund {
  amountInPaise: number;
  reason: string;
  status: RefundStatus;
  processedByStaffId: Types.ObjectId | null;
  processedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderDocument {
  orderNumber: string;
  channel: OrderChannel;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  paypalOrderId: string | null;
  paypalCaptureId: string | null;
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
    isService: { type: Boolean, default: false },
  },
  { _id: false },
);

const refundSchema = new Schema<OrderRefund>(
  {
    amountInPaise: paiseField(),
    reason: { type: String, trim: true, default: "", maxlength: 500 },
    status: {
      type: String,
      enum: REFUND_STATUS_VALUES,
      default: REFUND_STATUS.REQUESTED,
      required: true,
    },
    processedByStaffId: {
      type: Schema.Types.ObjectId,
      ref: STAFF_PROFILE_MODEL,
      default: null,
    },
    processedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
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
      default: PAYMENT_METHOD.PAYPAL,
    },
    paymentStatus: {
      type: String,
      enum: PAYMENT_STATUS_VALUES,
      required: true,
      default: PAYMENT_STATUS.PENDING,
    },
    paypalOrderId: { type: String, trim: true, default: null },
    paypalCaptureId: { type: String, trim: true, default: null },
    currency: { type: String, trim: true, uppercase: true, default: "INR", maxlength: 3 },
    /** Reserved for Phase 2 customer accounts; guest orders leave it null. */
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
orderSchema.index({ paypalOrderId: 1 }, { sparse: true, unique: true });
orderSchema.index({ paypalCaptureId: 1 }, { sparse: true, unique: true });

export const Order: Model<OrderDocument> =
  (mongoose.models.Order as Model<OrderDocument> | undefined) ??
  mongoose.model<OrderDocument>("Order", orderSchema);

export default Order;
