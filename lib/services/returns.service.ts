import "server-only";

import { Types } from "mongoose";

import { AUDIT_ACTION } from "@/lib/constants/audit";
import {
  ORDER_STATUS,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  REFUND_STATUS,
  computePaymentStatus,
  type PaymentMethod,
} from "@/lib/constants/order";
import { STAFF_PERMISSION } from "@/lib/constants/staff";
import { connectDB } from "@/lib/db/mongodb";
import { ensureRequestTime } from "@/lib/db/request-time";
import { recordAudit } from "@/lib/services/audit.service";
import { recordStockMovement } from "@/lib/services/stock-movement.service";
import { toDatabaseError } from "@/lib/services/service-errors";
import {
  ForbiddenError,
  InvalidRequestError,
  NotFoundError,
} from "@/lib/utils/errors";
import { Customer } from "@/models/Customer";
import { Order, type OrderDocument } from "@/models/Order";
import { Product } from "@/models/Product";
import { STOCK_MOVEMENT_TYPE } from "@/models/StockMovement";
import type { StaffView } from "@/types/staff";

export interface ReturnLineInput {
  productId: string;
  quantity: number;
  condition: "sellable" | "damaged";
  reason?: string;
}

export interface ProcessSalesReturnInput {
  orderNumber: string;
  items: ReturnLineInput[];
  refundMethod: PaymentMethod;
  referenceNumber?: string;
  notes?: string;
}

export interface ReturnReceiptResult {
  orderNumber: string;
  refundAmountInPaise: number;
  refundMethod: PaymentMethod;
  refundStatus: string;
  returnedItems: {
    productId: string;
    productName: string;
    sku: string;
    quantity: number;
    condition: "sellable" | "damaged";
    refundInPaise: number;
  }[];
  processedByName: string;
  createdAt: string;
}

export async function processSalesReturn(
  input: ProcessSalesReturnInput,
  actor: StaffView,
): Promise<ReturnReceiptResult> {
  const canRefund =
    actor.effectivePermissions.includes(STAFF_PERMISSION.ISSUE_REFUND) ||
    actor.effectivePermissions.includes(STAFF_PERMISSION.PAYMENTS_REFUND_APPROVE);

  if (!canRefund) {
    throw new ForbiddenError("You are not authorized to approve or issue refunds.");
  }

  if (!input.items || input.items.length === 0) {
    throw new InvalidRequestError("Select at least one item to return.");
  }

  await ensureRequestTime();

  try {
    await connectDB();
    const order = await Order.findOne({ orderNumber: input.orderNumber.trim().toUpperCase() });
    if (!order) throw new NotFoundError("Order not found.");

    if (order.status === ORDER_STATUS.REFUNDED) {
      throw new InvalidRequestError("This order is already fully refunded.");
    }
    if (order.status === ORDER_STATUS.CANCELLED) {
      throw new InvalidRequestError("Cannot process a return for a cancelled order.");
    }

    const netPaid = (order.amountPaidInPaise ?? 0) - (order.refundedTotalInPaise ?? 0);
    if (netPaid <= 0) {
      throw new InvalidRequestError("No refundable balance remains on this order.");
    }

    let totalRefundInPaise = 0;
    const processedLines: ReturnReceiptResult["returnedItems"] = [];

    for (const returnItem of input.items) {
      if (returnItem.quantity <= 0) continue;

      const orderItem = order.items.find(
        (i) => String(i.productId) === returnItem.productId,
      );
      if (!orderItem) {
        throw new InvalidRequestError(`Product ${returnItem.productId} was not in this order.`);
      }

      // Calculate already returned quantity for this product from cumulative history
      const alreadyReturnedQty = orderItem.returnedQuantity ?? 0;
      const eligibleQty = orderItem.quantity - alreadyReturnedQty;

      if (returnItem.quantity > eligibleQty) {
        throw new InvalidRequestError(
          `Cannot return ${returnItem.quantity} of ${orderItem.productName}. Maximum eligible is ${eligibleQty}.`,
        );
      }

      const lineRefundInPaise = orderItem.unitPriceInPaise * returnItem.quantity;
      totalRefundInPaise += lineRefundInPaise;

      // Track cumulative returned quantity on this line
      orderItem.returnedQuantity = alreadyReturnedQty + returnItem.quantity;

      // Update product stock if sellable
      if (returnItem.condition === "sellable" && !orderItem.isService) {
        const prod = await Product.findById(orderItem.productId);
        if (prod) {
          const before = prod.stock;
          prod.stock += returnItem.quantity;
          await prod.save();

          await recordStockMovement({
            productId: prod._id,
            productName: prod.name,
            sku: prod.sku,
            movementType: STOCK_MOVEMENT_TYPE.RETURN_RESTOCK,
            quantityChange: returnItem.quantity,
            quantityBefore: before,
            quantityAfter: prod.stock,
            referenceId: order.orderNumber,
            referenceType: "Order",
            reason: `Sales return (${returnItem.reason || "Customer return - sellable"})`,
            performedByStaffId: actor.id,
            performedByName: actor.name,
          });
        }
      } else if (returnItem.condition === "damaged" && !orderItem.isService) {
        // Track damaged stock in ledger without increasing sellable physical stock
        const prod = await Product.findById(orderItem.productId);
        if (prod) {
          await recordStockMovement({
            productId: prod._id,
            productName: prod.name,
            sku: prod.sku,
            movementType: STOCK_MOVEMENT_TYPE.DAMAGED,
            quantityChange: 0,
            quantityBefore: prod.stock,
            quantityAfter: prod.stock,
            referenceId: order.orderNumber,
            referenceType: "Order",
            reason: `Returned damaged (${returnItem.reason || "Damaged item returned by customer"})`,
            performedByStaffId: actor.id,
            performedByName: actor.name,
          });
        }
      }

      processedLines.push({
        productId: String(orderItem.productId),
        productName: orderItem.productName,
        sku: orderItem.sku,
        quantity: returnItem.quantity,
        condition: returnItem.condition,
        refundInPaise: lineRefundInPaise,
      });
    }

    // Clamp refund to net paid
    if (totalRefundInPaise > netPaid) {
      totalRefundInPaise = netPaid;
    }

    const returnReason = input.items.map((i) => i.reason).filter(Boolean).join("; ") || "Customer return";

    const refundEntry = {
      amountInPaise: totalRefundInPaise,
      reason: returnReason,
      refundMethod: input.refundMethod,
      status: REFUND_STATUS.COMPLETED,
      referenceNumber: input.referenceNumber?.trim() ?? "",
      processedByStaffId: new Types.ObjectId(actor.id),
      processedAt: new Date(),
      notes: input.notes?.trim() ?? "",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    order.refunds.push(refundEntry);
    order.refundedTotalInPaise = (order.refundedTotalInPaise ?? 0) + totalRefundInPaise;

    // Update payment status
    order.paymentStatus = computePaymentStatus(
      order.totalInPaise,
      order.amountPaidInPaise,
      order.refundedTotalInPaise,
    );

    // If fully refunded, mark status REFUNDED
    if (order.refundedTotalInPaise >= order.totalInPaise) {
      order.status = ORDER_STATUS.REFUNDED;
    }

    await order.save();

    // Adjust customer total purchases if customer was linked
    if (order.customerId) {
      await Customer.findByIdAndUpdate(order.customerId, {
        $inc: { totalPurchasesInPaise: -totalRefundInPaise },
      });
    }

    await recordAudit({
      actorStaffId: actor.id,
      actorRole: actor.role,
      action: AUDIT_ACTION.SALES_RETURN_PROCESSED,
      resource: "Order",
      resourceId: String(order._id),
      metadata: {
        orderNumber: order.orderNumber,
        refundAmountInPaise: totalRefundInPaise,
        refundMethod: input.refundMethod,
        itemsCount: processedLines.length,
      },
    });

    return {
      orderNumber: order.orderNumber,
      refundAmountInPaise: totalRefundInPaise,
      refundMethod: input.refundMethod,
      refundStatus: REFUND_STATUS.COMPLETED,
      returnedItems: processedLines,
      processedByName: actor.name,
      createdAt: new Date().toISOString(),
    };
  } catch (error) {
    throw toDatabaseError(error);
  }
}
