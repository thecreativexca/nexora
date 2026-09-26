import "server-only";

import mongoose, { Types } from "mongoose";

import { AUDIT_ACTION } from "@/lib/constants/audit";
import {
  ORDER_CHANNEL,
  ORDER_STATUS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TONES,
  ONLINE_ORDER_TRANSITIONS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  PAYMENT_STATUS_LABELS,
  REFUND_STATUS,
  REFUND_STATUS_LABELS,
  type OrderChannel,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus,
  type RefundStatus,
} from "@/lib/constants/order";
import { connectDB } from "@/lib/db/mongodb";
import { ensureRequestTime } from "@/lib/db/request-time";
import { recordAudit } from "@/lib/services/audit.service";
import { refundPayPalCapture } from "@/lib/payments/paypal";
import { toDatabaseError } from "@/lib/services/service-errors";
import {
  AlreadyRefundedError,
  InvalidOrderTransitionError,
  InvalidRequestError,
  NotFoundError,
  OrderRefundFailedError,
  TransactionsUnsupportedError,
  isAppError,
  isTransactionUnsupportedError,
} from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";
import { isWellFormedOrderNumber } from "@/lib/utils/order-number";
import { escapeRegExp, normalizeSearchTerm } from "@/lib/utils/search";
import { Order, type OrderItemSnapshot } from "@/models/Order";
import { Product } from "@/models/Product";
import { StaffProfile } from "@/models/StaffProfile";
import type {
  RefundRecordView,
  StaffOrderDetail,
  StaffOrderListResult,
  StaffOrderSummary,
} from "@/types/order";
import type { StaffView } from "@/types/staff";

/**
 * Staff orders management (Phase 5).
 *
 * - List/detail read paths query the shared Order collection (ONLINE and
 *   IN_STORE orders live side by side - there is exactly one order system).
 * - Status mutations only move ONLINE orders along the controlled delivery
 *   workflow; in-store sales stay "completed" where the register left them.
 * - Refunds are full-order and transactional: physical quantities are restored
 *   and the order is marked REFUNDED in one MongoDB transaction. A second
 *   refund is impossible, even with concurrent requests.
 *
 * Mutation access is enforced by the route layer through the centralised
 * permission matrix (MANAGE_ORDER_STATUS / ISSUE_REFUND), never hard-coded
 * role strings.
 */

interface LeanRefundRecord {
  amountInPaise: number;
  reason: string;
  status: RefundStatus;
  processedByStaffId?: Types.ObjectId | null;
  processedAt?: Date | null;
}

export interface LeanOrderRecord {
  _id: Types.ObjectId;
  orderNumber: string;
  channel: OrderChannel;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  paypalCaptureId?: string | null;
  customerId: Types.ObjectId | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  deliveryAddress?: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  } | null;
  items: OrderItemSnapshot[];
  subtotalInPaise: number;
  discountInPaise?: number;
  taxInPaise?: number;
  totalInPaise: number;
  refundedTotalInPaise?: number;
  refunds?: LeanRefundRecord[];
  notes?: string;
  placedByStaffId?: Types.ObjectId | null;
  placedByName?: string;
  createdAt: Date;
}

const ORDER_LIST_FIELDS =
  "orderNumber channel status paymentMethod paymentStatus customerName customerEmail items totalInPaise placedByName refundedTotalInPaise refunds createdAt";

function itemCountOf(items: readonly OrderItemSnapshot[]): number {
  return items.reduce((count, item) => count + item.quantity, 0);
}

function isRefundedOrder(order: Pick<LeanOrderRecord, "status" | "refundedTotalInPaise" | "refunds">): boolean {
  if (order.status === ORDER_STATUS.REFUNDED) return true;
  if ((order.refundedTotalInPaise ?? 0) > 0) return true;
  return Boolean(order.refunds?.some((refund) => refund.status === REFUND_STATUS.COMPLETED));
}

function toStaffOrderSummary(order: LeanOrderRecord): StaffOrderSummary {
  return {
    orderNumber: order.orderNumber,
    placedAt: new Date(order.createdAt).toISOString(),
    channel: order.channel,
    status: order.status,
    statusLabel: ORDER_STATUS_LABELS[order.status],
    statusTone: ORDER_STATUS_TONES[order.status],
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    paymentMethod: order.paymentMethod,
    paymentMethodLabel: PAYMENT_METHOD_LABELS[order.paymentMethod],
    paymentStatus: order.paymentStatus,
    paymentStatusLabel: PAYMENT_STATUS_LABELS[order.paymentStatus],
    itemCount: itemCountOf(order.items),
    totalInPaise: order.totalInPaise,
    placedByName: order.placedByName?.trim() || null,
    refunded: isRefundedOrder(order),
  };
}

function toStaffOrderDetail(
  order: LeanOrderRecord,
  staffNames: Map<string, string>,
): StaffOrderDetail {
  const address = order.deliveryAddress;
  const refunded = isRefundedOrder(order);

  const refunds: RefundRecordView[] = (order.refunds ?? []).map((refund) => ({
    amountInPaise: refund.amountInPaise,
    reason: refund.reason ?? "",
    status: refund.status,
    statusLabel: REFUND_STATUS_LABELS[refund.status],
    processedByStaffId: refund.processedByStaffId ? String(refund.processedByStaffId) : null,
    processedByStaffName: refund.processedByStaffId
      ? staffNames.get(String(refund.processedByStaffId)) ?? null
      : null,
    processedAt: refund.processedAt ? new Date(refund.processedAt).toISOString() : null,
  }));

  const allowedNextStatuses: OrderStatus[] =
    order.channel === ORDER_CHANNEL.ONLINE
      ? [...(ONLINE_ORDER_TRANSITIONS[order.status] ?? [])]
      : [];

  return {
    orderNumber: order.orderNumber,
    placedAt: new Date(order.createdAt).toISOString(),
    channel: order.channel,
    status: order.status,
    statusLabel: ORDER_STATUS_LABELS[order.status],
    statusTone: ORDER_STATUS_TONES[order.status],
    paymentMethod: order.paymentMethod,
    paymentMethodLabel: PAYMENT_METHOD_LABELS[order.paymentMethod],
    paymentStatus: order.paymentStatus,
    paymentStatusLabel: PAYMENT_STATUS_LABELS[order.paymentStatus],
    customerId: order.customerId ? String(order.customerId) : null,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    deliveryAddress: {
      line1: address?.line1 ?? "",
      line2: address?.line2 ?? "",
      city: address?.city ?? "",
      state: address?.state ?? "",
      postalCode: address?.postalCode ?? "",
      country: address?.country ?? "",
    },
    items: order.items.map((item) => ({
      productId: String(item.productId),
      productName: item.productName,
      sku: item.sku,
      image: item.image ?? "",
      quantity: item.quantity,
      unitPriceInPaise: item.unitPriceInPaise,
      lineTotalInPaise: item.lineTotalInPaise,
      isService: Boolean(item.isService),
    })),
    subtotalInPaise: order.subtotalInPaise,
    discountInPaise: order.discountInPaise ?? 0,
    taxInPaise: order.taxInPaise ?? 0,
    totalInPaise: order.totalInPaise,
    itemCount: itemCountOf(order.items),
    notes: order.notes ?? "",
    placedById: order.placedByStaffId ? String(order.placedByStaffId) : null,
    placedByName: order.placedByName?.trim() || null,
    refunded,
    refundedTotalInPaise: order.refundedTotalInPaise ?? 0,
    refunds,
    allowedNextStatuses,
    refundable: !refunded && order.status !== ORDER_STATUS.CANCELLED,
  };
}

/** Maps staff ObjectIds -> names so the detail view never needs two queries. */
async function loadStaffNameMap(records: readonly LeanOrderRecord[]): Promise<Map<string, string>> {
  const ids = new Set<string>();
  for (const record of records) {
    if (record.placedByStaffId) ids.add(String(record.placedByStaffId));
    for (const refund of record.refunds ?? []) {
      if (refund.processedByStaffId) ids.add(String(refund.processedByStaffId));
    }
  }
  if (ids.size === 0) return new Map();

  const staff = await StaffProfile.find({ _id: { $in: [...ids].map((id) => new Types.ObjectId(id)) } })
    .select("name")
    .lean<{ _id: Types.ObjectId; name: string }[]>();
  return new Map(staff.map((member) => [String(member._id), member.name]));
}

function normalizeOrderNumber(orderNumber: string): string {
  return orderNumber.trim().toUpperCase();
}

function assertWellFormedOrderNumber(orderNumber: string): string {
  const normalized = normalizeOrderNumber(orderNumber);
  if (!isWellFormedOrderNumber(normalized)) {
    throw new NotFoundError("No order matches that number.");
  }
  return normalized;
}

/* ---------------------------------------------------------------------------
 * List / detail
 * ------------------------------------------------------------------------- */

export interface StaffOrderListInput {
  page: number;
  pageSize: number;
  channel?: OrderChannel;
  status?: OrderStatus;
  search: string;
}

export async function listStaffOrders(input: StaffOrderListInput): Promise<StaffOrderListResult> {
  await ensureRequestTime();

  try {
    await connectDB();
  } catch (error) {
    throw toDatabaseError(error);
  }

  const filter: Record<string, unknown> = {};
  if (input.channel) filter.channel = input.channel;
  if (input.status) filter.status = input.status;

  const term = normalizeSearchTerm(input.search);
  if (term) {
    // Escaped + anchored, so ".*" or "(0/" can never become a pattern, and the
    // unique orderNumber index handles the prefix scan.
    filter.orderNumber = { $regex: `^${escapeRegExp(term.toUpperCase())}` };
  }

  try {
    const [rows, total] = await Promise.all([
      Order.find(filter)
        .select(ORDER_LIST_FIELDS)
        .sort({ createdAt: -1, _id: -1 })
        .skip((input.page - 1) * input.pageSize)
        .limit(input.pageSize)
        .lean<LeanOrderRecord[]>(),
      Order.countDocuments(filter),
    ]);

    return {
      orders: rows.map(toStaffOrderSummary),
      total,
      page: input.page,
      pageSize: input.pageSize,
      totalPages: Math.ceil(total / input.pageSize),
    };
  } catch (error) {
    throw toDatabaseError(error);
  }
}

export async function getStaffOrderDetail(orderNumber: string): Promise<StaffOrderDetail | null> {
  const normalized = assertWellFormedOrderNumber(orderNumber);

  await ensureRequestTime();

  try {
    await connectDB();
    const order = await Order.findOne({ orderNumber: normalized })
      .lean<LeanOrderRecord | null>();
    if (!order) return null;
    const staffNames = await loadStaffNameMap([order]);
    return toStaffOrderDetail(order, staffNames);
  } catch (error) {
    throw toDatabaseError(error);
  }
}

/* ---------------------------------------------------------------------------
 * Status workflow (ONLINE orders only)
 * ------------------------------------------------------------------------- */

export async function updateStaffOrderStatus(
  orderNumber: string,
  newStatus: OrderStatus,
  staff: StaffView,
): Promise<StaffOrderDetail> {
  const normalized = assertWellFormedOrderNumber(orderNumber);

  await ensureRequestTime();

  try {
    await connectDB();
  } catch (error) {
    throw toDatabaseError(error);
  }

  try {
    const current = await Order.findOne({ orderNumber: normalized })
      .lean<LeanOrderRecord | null>();
    if (!current) throw new NotFoundError("No order matches that number.");

    if (current.channel !== ORDER_CHANNEL.ONLINE) {
      throw new InvalidRequestError(
        "In-store sales are completed at the register and do not follow the delivery workflow.",
      );
    }

    const allowed = ONLINE_ORDER_TRANSITIONS[current.status] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new InvalidOrderTransitionError();
    }

    // Conditional CAS-style update: if two staff members act at once, only one
    // wins; the other is told the order just moved.
    const updated = await Order.findOneAndUpdate(
      { orderNumber: normalized, status: current.status },
      { $set: { status: newStatus } },
      { returnDocument: "after" },
    ).lean<LeanOrderRecord | null>();

    if (!updated) {
      throw new InvalidOrderTransitionError(
        "Another team member just changed this order. Refresh and try again.",
      );
    }

    await recordAudit({
      actorStaffId: staff.id,
      action: AUDIT_ACTION.ORDER_STATUS_CHANGED,
      metadata: {
        orderNumber: normalized,
        previousStatus: current.status,
        newStatus,
        channel: current.channel,
      },
    });

    const staffNames = await loadStaffNameMap([updated]);
    return toStaffOrderDetail(updated, staffNames);
  } catch (error) {
    if (isAppError(error)) throw error;
    throw toDatabaseError(error);
  }
}

/* ---------------------------------------------------------------------------
 * Full-order refund (atomic)
 * ------------------------------------------------------------------------- */

interface RefundRestoreLine {
  productId: string;
  sku: string;
  productName: string;
  quantity: number;
}

interface RefundOutcome {
  order: LeanOrderRecord;
  restoredItems: RefundRestoreLine[];
  missingProducts: RefundRestoreLine[];
}

/**
 * Issues a permanent full-order refund.
 *
 * Everything happens in ONE MongoDB transaction:
 *   1. Load the order and verify it is not already refunded / cancelled.
 *   2. Restore physical quantities (services are skipped - they hold no stock).
 *   3. Mark the order REFUNDED, flip payment to REFUNDED and append a COMPLETED
 *      refund record, guard-claimed with a conditional update so a concurrent
 *      double-refund request can never also restore stock.
 *   4. Commit. Any failure rolls back the whole refund (no half-restocked,
 *      half-flagged document can ever surface).
 */
export async function refundStaffOrder(
  orderNumber: string,
  reason: string,
  staff: StaffView,
): Promise<{ order: StaffOrderDetail; restoredItems: RefundRestoreLine[]; missingProducts: RefundRestoreLine[] }> {
  const normalized = assertWellFormedOrderNumber(orderNumber);
  const trimmedReason = reason.trim();

  await ensureRequestTime();

  try {
    await connectDB();
  } catch (error) {
    throw toDatabaseError(error);
  }

  const preflight = await Order.findOne({ orderNumber: normalized }).select("status refundedTotalInPaise refunds paymentMethod paypalCaptureId").lean<LeanOrderRecord | null>();
  if (!preflight) throw new NotFoundError("No order matches that number.");
  if (isRefundedOrder(preflight)) throw new AlreadyRefundedError();
  if (preflight.paymentMethod === PAYMENT_METHOD.PAYPAL) {
    if (!preflight.paypalCaptureId) throw new OrderRefundFailedError("This PayPal order has no capture reference and requires reconciliation.");
    try {
      const providerRefund = await refundPayPalCapture(preflight.paypalCaptureId, `refund-${String(preflight._id)}`);
      if (providerRefund.status !== "COMPLETED") throw new Error(`PayPal refund status ${providerRefund.status}`);
    } catch (error) {
      logger.error("PayPal refund was not confirmed; Nexora order left unchanged", error, { orderNumber: normalized });
      throw new OrderRefundFailedError("PayPal did not confirm the refund. The Nexora order and inventory were left unchanged; retry safely or reconcile in PayPal.");
    }
  }

  const session = await mongoose.startSession();

  try {
    const outcome = await session.withTransaction<RefundOutcome>(async () => {
      const order = await Order.findOne({ orderNumber: normalized }).session(session);
      if (!order) throw new NotFoundError("No order matches that number.");

      if (
        order.status === ORDER_STATUS.REFUNDED ||
        order.refundedTotalInPaise > 0 ||
        (order.refunds ?? []).some((refund) => refund.status === REFUND_STATUS.COMPLETED)
      ) {
        throw new AlreadyRefundedError();
      }
      if (order.status === ORDER_STATUS.CANCELLED) {
        throw new InvalidRequestError("Cancelled orders cannot be refunded.");
      }

      const restoredItems: RefundRestoreLine[] = [];
      const missingProducts: RefundRestoreLine[] = [];

      for (const item of order.items) {
        // Service purchases hold no physical inventory - never restock them.
        if (item.isService) continue;

        const write = await Product.updateOne(
          { _id: item.productId },
          { $inc: { stock: item.quantity } },
          { session },
        );

        const line: RefundRestoreLine = {
          productId: String(item.productId),
          sku: item.sku,
          productName: item.productName,
          quantity: item.quantity,
        };
        if (write.matchedCount === 0) missingProducts.push(line);
        else restoredItems.push(line);
      }

      const now = new Date();
      const updated = await Order.findOneAndUpdate(
        {
          _id: order._id,
          status: { $ne: ORDER_STATUS.REFUNDED },
          refundedTotalInPaise: 0,
        },
        {
          $set: {
            status: ORDER_STATUS.REFUNDED,
            paymentStatus: PAYMENT_STATUS.REFUNDED,
            refundedTotalInPaise: order.totalInPaise,
          },
          $push: {
            refunds: {
              amountInPaise: order.totalInPaise,
              reason: trimmedReason,
              status: REFUND_STATUS.COMPLETED,
              processedByStaffId: new Types.ObjectId(staff.id),
              processedAt: now,
            },
          },
        },
        { session, returnDocument: "after" },
      ).lean<LeanOrderRecord | null>();

      if (!updated) throw new AlreadyRefundedError();

      return { order: updated, restoredItems, missingProducts };
    });

    await recordAudit({
      actorStaffId: staff.id,
      action: AUDIT_ACTION.ORDER_REFUNDED,
      metadata: {
        orderNumber: normalized,
        amountInPaise: outcome.order.totalInPaise,
        reason: trimmedReason,
        actorName: staff.name,
        restoredQuantities: outcome.restoredItems,
        missingProducts: outcome.missingProducts,
      },
    });

    if (outcome.order.paymentMethod === PAYMENT_METHOD.PAYPAL) {
      await recordAudit({ actorStaffId: staff.id, action: AUDIT_ACTION.PAYPAL_REFUND_COMPLETED, metadata: { orderNumber: normalized, paypalCaptureId: outcome.order.paypalCaptureId } });
    }

    if (outcome.missingProducts.length > 0) {
      logger.warn("Refund referenced products that no longer exist - stock not restored for them", {
        orderNumber: normalized,
        products: outcome.missingProducts,
      });
    }

    const staffNames = await loadStaffNameMap([outcome.order]);
    return {
      order: toStaffOrderDetail(outcome.order, staffNames),
      restoredItems: outcome.restoredItems,
      missingProducts: outcome.missingProducts,
    };
  } catch (error) {
    if (isAppError(error)) throw error;
    if (isTransactionUnsupportedError(error)) {
      throw new TransactionsUnsupportedError(undefined, error);
    }
    logger.error("Refund transaction failed", error, { orderNumber: normalized });
    throw new OrderRefundFailedError(undefined, error);
  } finally {
    await session.endSession();
  }
}
