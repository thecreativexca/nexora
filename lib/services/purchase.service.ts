import "server-only";

import { Types } from "mongoose";

import { AUDIT_ACTION } from "@/lib/constants/audit";
import { connectDB } from "@/lib/db/mongodb";
import { ensureRequestTime } from "@/lib/db/request-time";
import { recordAudit } from "@/lib/services/audit.service";
import { recordStockMovement } from "@/lib/services/stock-movement.service";
import { toDatabaseError } from "@/lib/services/service-errors";
import {
  NotFoundError,
  InvalidRequestError,
  ForbiddenError,
} from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";
import { Product } from "@/models/Product";
import {
  PurchaseOrder,
  PURCHASE_ORDER_STATUS,
  type PurchaseOrderDocument,
  type PurchaseOrderStatus,
} from "@/models/PurchaseOrder";
import { STOCK_MOVEMENT_TYPE } from "@/models/StockMovement";
import { Supplier } from "@/models/Supplier";
import type { StaffView } from "@/types/staff";

export interface CreatePurchaseOrderItemInput {
  productId: string;
  orderedQuantity: number;
  unitCostInPaise: number;
}

export interface CreatePurchaseOrderInput {
  supplierId: string;
  items: CreatePurchaseOrderItemInput[];
  taxInPaise?: number;
  notes?: string;
  status?: "DRAFT" | "PENDING_APPROVAL";
}

function generatePoNumber(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `PO-${dateStr}-${random}`;
}

export async function createPurchaseOrder(
  input: CreatePurchaseOrderInput,
  actor: StaffView,
): Promise<PurchaseOrderDocument> {
  if (!input.items || input.items.length === 0) {
    throw new InvalidRequestError("A purchase order must have at least one item.");
  }
  if (!Types.ObjectId.isValid(input.supplierId)) {
    throw new NotFoundError("Invalid supplier ID.");
  }

  await ensureRequestTime();

  try {
    await connectDB();

    const supplier = await Supplier.findById(input.supplierId);
    if (!supplier || !supplier.isActive) {
      throw new NotFoundError("Active supplier not found.");
    }

    const productIds = input.items.map((i) => new Types.ObjectId(i.productId));
    const products = await Product.find({ _id: { $in: productIds } }).lean();
    const productMap = new Map(products.map((p) => [String(p._id), p]));

    let subtotalInPaise = 0;
    const items = input.items.map((item) => {
      const p = productMap.get(item.productId);
      if (!p) throw new NotFoundError(`Product not found: ${item.productId}`);
      const lineTotalInPaise = item.orderedQuantity * item.unitCostInPaise;
      subtotalInPaise += lineTotalInPaise;

      return {
        productId: new Types.ObjectId(item.productId),
        productName: p.name,
        sku: p.sku,
        orderedQuantity: item.orderedQuantity,
        receivedQuantity: 0,
        rejectedQuantity: 0,
        unitCostInPaise: item.unitCostInPaise,
        lineTotalInPaise,
      };
    });

    const taxInPaise = input.taxInPaise ?? 0;
    const totalInPaise = subtotalInPaise + taxInPaise;
    const poNumber = generatePoNumber();

    const po = await PurchaseOrder.create({
      poNumber,
      supplierId: supplier._id,
      supplierName: supplier.name,
      status: input.status ?? PURCHASE_ORDER_STATUS.PENDING_APPROVAL,
      items,
      subtotalInPaise,
      taxInPaise,
      totalInPaise,
      amountPaidInPaise: 0,
      paymentStatus: "UNPAID",
      payments: [],
      receiptHistory: [],
      notes: input.notes?.trim() ?? "",
      createdByStaffId: new Types.ObjectId(actor.id),
    });

    // Update supplier's outstanding due
    supplier.outstandingDueInPaise = (supplier.outstandingDueInPaise ?? 0) + totalInPaise;
    await supplier.save();

    await recordAudit({
      actorStaffId: actor.id,
      actorRole: actor.role,
      action: AUDIT_ACTION.PURCHASE_ORDER_CREATED,
      resource: "PurchaseOrder",
      resourceId: String(po._id),
      metadata: { poNumber, supplierName: supplier.name, totalInPaise },
    });

    return po;
  } catch (error) {
    throw toDatabaseError(error);
  }
}

export async function approvePurchaseOrder(
  poNumber: string,
  actor: StaffView,
): Promise<PurchaseOrderDocument> {
  await ensureRequestTime();

  try {
    await connectDB();
    const po = await PurchaseOrder.findOne({ poNumber: poNumber.trim().toUpperCase() });
    if (!po) throw new NotFoundError("Purchase order not found.");

    if (po.status !== PURCHASE_ORDER_STATUS.PENDING_APPROVAL && po.status !== PURCHASE_ORDER_STATUS.DRAFT) {
      throw new InvalidRequestError(`Cannot approve a purchase order in ${po.status} status.`);
    }

    po.status = PURCHASE_ORDER_STATUS.APPROVED;
    po.approvedByStaffId = new Types.ObjectId(actor.id);
    await po.save();

    await recordAudit({
      actorStaffId: actor.id,
      actorRole: actor.role,
      action: AUDIT_ACTION.PURCHASE_ORDER_APPROVED,
      resource: "PurchaseOrder",
      resourceId: String(po._id),
      metadata: { poNumber: po.poNumber },
    });

    return po;
  } catch (error) {
    throw toDatabaseError(error);
  }
}

export interface ReceiveItemsInput {
  receiptItems: {
    productId: string;
    quantityAccepted: number;
    quantityRejected?: number;
    notes?: string;
  }[];
  notes?: string;
}

/**
 * Records receipt of goods against an approved purchase order.
 * CRITICAL RULE: Stock increases ONLY when accepted goods are received!
 */
export async function receivePurchaseOrderItems(
  poNumber: string,
  input: ReceiveItemsInput,
  actor: StaffView,
): Promise<PurchaseOrderDocument> {
  await ensureRequestTime();

  try {
    await connectDB();
    const po = await PurchaseOrder.findOne({ poNumber: poNumber.trim().toUpperCase() });
    if (!po) throw new NotFoundError("Purchase order not found.");

    if (
      po.status !== PURCHASE_ORDER_STATUS.APPROVED &&
      po.status !== PURCHASE_ORDER_STATUS.PARTIALLY_RECEIVED
    ) {
      throw new InvalidRequestError(
        `Cannot receive goods for purchase order in status ${po.status}. It must be APPROVED or PARTIALLY_RECEIVED.`,
      );
    }

    const receiptRecordItems: {
      productId: Types.ObjectId;
      quantityAccepted: number;
      quantityRejected: number;
      notes?: string;
    }[] = [];

    for (const rec of input.receiptItems) {
      const item = po.items.find((i) => String(i.productId) === rec.productId);
      if (!item) {
        throw new InvalidRequestError(`Product ${rec.productId} is not on this purchase order.`);
      }

      const accepted = Math.max(0, rec.quantityAccepted || 0);
      const rejected = Math.max(0, rec.quantityRejected || 0);

      // Rejected goods do not fulfil the purchase order: suppliers may replace
      // them in a later receipt. Only accepted quantity reduces the outstanding
      // amount still expected.
      const remainingToReceive = item.orderedQuantity - item.receivedQuantity;
      if (accepted + rejected > remainingToReceive) {
        throw new InvalidRequestError(
          `Cannot receive ${accepted + rejected} units of ${item.productName}. Only ${remainingToReceive} remaining on this order.`,
        );
      }

      item.receivedQuantity += accepted;
      item.rejectedQuantity += rejected;

      if (accepted > 0) {
        // Atomically increment product stock
        const product = await Product.findById(item.productId);
        if (product) {
          const beforeStock = product.stock;
          product.stock += accepted;
          await product.save();

          // Append to StockMovement ledger
          await recordStockMovement({
            productId: product._id,
            productName: product.name,
            sku: product.sku,
            movementType: STOCK_MOVEMENT_TYPE.PURCHASE_RECEIPT,
            quantityChange: accepted,
            quantityBefore: beforeStock,
            quantityAfter: product.stock,
            referenceId: po.poNumber,
            referenceType: "PurchaseOrder",
            reason: `Goods receipt for ${po.poNumber} from ${po.supplierName}`,
            performedByStaffId: actor.id,
            performedByName: actor.name,
          });
        }
      }

      receiptRecordItems.push({
        productId: item.productId,
        quantityAccepted: accepted,
        quantityRejected: rejected,
        notes: rec.notes ?? "",
      });
    }

    // Determine if completely received
    const allCompleted = po.items.every(
      (item) => item.receivedQuantity >= item.orderedQuantity,
    );
    po.status = allCompleted ? PURCHASE_ORDER_STATUS.RECEIVED : PURCHASE_ORDER_STATUS.PARTIALLY_RECEIVED;

    po.receiptHistory.push({
      receiptDate: new Date(),
      receivedByStaffId: new Types.ObjectId(actor.id),
      receivedByName: actor.name,
      items: receiptRecordItems,
      notes: input.notes?.trim() ?? "",
      createdAt: new Date(),
    });

    await po.save();

    await recordAudit({
      actorStaffId: actor.id,
      actorRole: actor.role,
      action: AUDIT_ACTION.PURCHASE_GOODS_RECEIVED,
      resource: "PurchaseOrder",
      resourceId: String(po._id),
      metadata: {
        poNumber: po.poNumber,
        newStatus: po.status,
        receiptItemsCount: receiptRecordItems.length,
      },
    });

    return po;
  } catch (error) {
    throw toDatabaseError(error);
  }
}

export interface RecordSupplierPaymentInput {
  amountInPaise: number;
  paymentMethod: string;
  referenceNumber?: string;
  notes?: string;
}

export async function recordSupplierPayment(
  poNumber: string,
  input: RecordSupplierPaymentInput,
  actor: StaffView,
): Promise<PurchaseOrderDocument> {
  if (input.amountInPaise <= 0) {
    throw new InvalidRequestError("Payment amount must be greater than zero.");
  }

  await ensureRequestTime();

  try {
    await connectDB();
    const po = await PurchaseOrder.findOne({ poNumber: poNumber.trim().toUpperCase() });
    if (!po) throw new NotFoundError("Purchase order not found.");

    const remainingDue = po.totalInPaise - po.amountPaidInPaise;
    if (remainingDue <= 0) {
      throw new InvalidRequestError("This purchase order is already fully paid.");
    }

    if (input.amountInPaise > remainingDue) {
      throw new InvalidRequestError(
        `Payment amount (₹${(input.amountInPaise / 100).toFixed(2)}) cannot exceed remaining due (₹${(remainingDue / 100).toFixed(2)}).`,
      );
    }

    po.amountPaidInPaise += input.amountInPaise;
    po.paymentStatus = po.amountPaidInPaise >= po.totalInPaise ? "PAID" : "PARTIALLY_PAID";

    po.payments.push({
      amountInPaise: input.amountInPaise,
      paymentMethod: input.paymentMethod.trim(),
      referenceNumber: input.referenceNumber?.trim() ?? "",
      paidAt: new Date(),
      notes: input.notes?.trim() ?? "",
      recordedByStaffId: new Types.ObjectId(actor.id),
    });

    await po.save();

    // Decrement supplier's outstanding dues
    await Supplier.findByIdAndUpdate(po.supplierId, {
      $inc: { outstandingDueInPaise: -input.amountInPaise },
    });

    await recordAudit({
      actorStaffId: actor.id,
      actorRole: actor.role,
      action: AUDIT_ACTION.PURCHASE_PAYMENT_RECORDED,
      resource: "PurchaseOrder",
      resourceId: String(po._id),
      metadata: {
        poNumber: po.poNumber,
        amountInPaise: input.amountInPaise,
        paymentStatus: po.paymentStatus,
      },
    });

    return po;
  } catch (error) {
    throw toDatabaseError(error);
  }
}

export async function cancelPurchaseOrder(
  poNumber: string,
  reason: string,
  actor: StaffView,
): Promise<PurchaseOrderDocument> {
  await ensureRequestTime();

  try {
    await connectDB();
    const po = await PurchaseOrder.findOne({ poNumber: poNumber.trim().toUpperCase() });
    if (!po) throw new NotFoundError("Purchase order not found.");

    const hasReceivedItems = po.items.some((i) => i.receivedQuantity > 0);
    if (hasReceivedItems) {
      throw new InvalidRequestError("Cannot cancel a purchase order where items have already been received.");
    }

    if (po.status === PURCHASE_ORDER_STATUS.CANCELLED) {
      throw new InvalidRequestError("Purchase order is already cancelled.");
    }

    po.status = PURCHASE_ORDER_STATUS.CANCELLED;
    po.cancelledByStaffId = new Types.ObjectId(actor.id);
    po.cancellationReason = reason.trim();

    // Deduct unpaid order amount from supplier's outstanding dues
    const unpaidBalance = po.totalInPaise - po.amountPaidInPaise;
    if (unpaidBalance > 0) {
      await Supplier.findByIdAndUpdate(po.supplierId, {
        $inc: { outstandingDueInPaise: -unpaidBalance },
      });
    }

    await po.save();

    await recordAudit({
      actorStaffId: actor.id,
      actorRole: actor.role,
      action: AUDIT_ACTION.PURCHASE_ORDER_CANCELLED,
      resource: "PurchaseOrder",
      resourceId: String(po._id),
      metadata: { poNumber: po.poNumber, reason },
    });

    return po;
  } catch (error) {
    throw toDatabaseError(error);
  }
}

export interface ListPurchaseOrdersInput {
  status?: string;
  supplierId?: string;
  page?: number;
  pageSize?: number;
}

export async function listPurchaseOrders(input: ListPurchaseOrdersInput = {}) {
  await ensureRequestTime();

  try {
    await connectDB();
    const filter: Record<string, unknown> = {};
    if (input.status) filter.status = input.status;
    if (input.supplierId && Types.ObjectId.isValid(input.supplierId)) {
      filter.supplierId = new Types.ObjectId(input.supplierId);
    }

    const page = Math.max(1, input.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20));

    const [rows, total] = await Promise.all([
      PurchaseOrder.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      PurchaseOrder.countDocuments(filter),
    ]);

    return {
      purchaseOrders: rows.map((po) => ({
        id: String(po._id),
        poNumber: po.poNumber,
        supplierId: String(po.supplierId),
        supplierName: po.supplierName,
        status: po.status,
        totalInPaise: po.totalInPaise,
        amountPaidInPaise: po.amountPaidInPaise,
        paymentStatus: po.paymentStatus,
        itemCount: po.items.length,
        createdAt: po.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  } catch (error) {
    throw toDatabaseError(error);
  }
}

export async function getPurchaseOrderDetail(poNumber: string) {
  await ensureRequestTime();

  try {
    await connectDB();
    const po = await PurchaseOrder.findOne({ poNumber: poNumber.trim().toUpperCase() }).lean();
    if (!po) return null;

    return {
      id: String(po._id),
      poNumber: po.poNumber,
      supplierId: String(po.supplierId),
      supplierName: po.supplierName,
      status: po.status,
      items: po.items.map((i) => ({
        productId: String(i.productId),
        productName: i.productName,
        sku: i.sku,
        orderedQuantity: i.orderedQuantity,
        receivedQuantity: i.receivedQuantity,
        rejectedQuantity: i.rejectedQuantity,
        unitCostInPaise: i.unitCostInPaise,
        lineTotalInPaise: i.lineTotalInPaise,
      })),
      subtotalInPaise: po.subtotalInPaise,
      taxInPaise: po.taxInPaise,
      totalInPaise: po.totalInPaise,
      amountPaidInPaise: po.amountPaidInPaise,
      paymentStatus: po.paymentStatus,
      payments: po.payments.map((p) => ({
        id: String((p as { _id?: Types.ObjectId })._id ?? ""),
        amountInPaise: p.amountInPaise,
        paymentMethod: p.paymentMethod,
        referenceNumber: p.referenceNumber,
        paidAt: p.paidAt.toISOString(),
        notes: p.notes,
      })),
      receiptHistory: po.receiptHistory.map((r) => ({
        id: String((r as { _id?: Types.ObjectId })._id ?? ""),
        receiptDate: r.receiptDate.toISOString(),
        receivedByName: r.receivedByName,
        notes: r.notes,
        items: r.items.map((it) => ({
          productId: String(it.productId),
          quantityAccepted: it.quantityAccepted,
          quantityRejected: it.quantityRejected,
          notes: it.notes ?? "",
        })),
      })),
      notes: po.notes,
      createdAt: po.createdAt.toISOString(),
    };
  } catch (error) {
    throw toDatabaseError(error);
  }
}
