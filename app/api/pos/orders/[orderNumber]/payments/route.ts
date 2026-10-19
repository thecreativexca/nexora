import type { NextRequest } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";

import { requireStaffApi } from "@/lib/auth/staff-session";
import { AUDIT_ACTION } from "@/lib/constants/audit";
import {
  PAYMENT_METHOD,
  PAYMENT_METHOD_VALUES,
  PAYMENT_STATUS,
  type PaymentMethod,
} from "@/lib/constants/order";
import { STAFF_PERMISSION } from "@/lib/constants/staff";
import { connectDB } from "@/lib/db/mongodb";
import { recordAudit } from "@/lib/services/audit.service";
import { getStaffOrderDetail } from "@/lib/services/staff-orders.service";
import {
  ForbiddenError,
  InvalidRequestError,
  NotFoundError,
  validationError,
} from "@/lib/utils/errors";
import { readJsonBody, toErrorResponse, toSuccessResponse } from "@/lib/utils/http";
import { Order } from "@/models/Order";

interface RouteContext {
  params: Promise<{ orderNumber: string }>;
}

const recordPaymentSchema = z.object({
  amountInPaise: z
    .number()
    .int("Amount must be a whole number of paise.")
    .positive("Amount must be greater than zero."),
  paymentMethod: z.enum(
    [
      PAYMENT_METHOD.CASH,
      PAYMENT_METHOD.UPI,
      PAYMENT_METHOD.CARD,
      PAYMENT_METHOD.BANK_TRANSFER,
      PAYMENT_METHOD.CHEQUE,
    ],
    { message: "Select a valid offline payment method." },
  ),
  referenceNumber: z.string().trim().max(100).optional().default(""),
  notes: z.string().trim().max(500).optional().default(""),
});

const verifyPaymentSchema = z.object({
  paymentEntryId: z.string().optional(),
  notes: z.string().trim().max(500).optional().default(""),
});

/**
 * Record an offline payment against an existing order (partial or full).
 * Requires PAYMENTS_COLLECT permission.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const staff = await requireStaffApi();
    if (!staff.effectivePermissions.includes(STAFF_PERMISSION.PAYMENTS_COLLECT)) {
      throw new ForbiddenError("You are not authorized to collect payments.");
    }

    const { orderNumber } = await params;
    const parsedBody = await readJsonBody(request, "POST /api/pos/orders/[orderNumber]/payments invalid JSON");
    if ("error" in parsedBody) return parsedBody.error;

    const parsed = recordPaymentSchema.safeParse(parsedBody.body);
    if (!parsed.success) {
      return toErrorResponse(
        validationError(parsed.error),
        "POST /api/pos/orders/[orderNumber]/payments invalid body",
      );
    }

    await connectDB();
    const order = await Order.findOne({ orderNumber: orderNumber.trim().toUpperCase() });
    if (!order) throw new NotFoundError("Order not found.");

    const currentPaid = order.amountPaidInPaise ?? 0;
    const remainingDue = Math.max(0, order.totalInPaise - currentPaid);

    if (remainingDue <= 0) {
      throw new InvalidRequestError("This order is already fully paid.");
    }

    if (parsed.data.amountInPaise > remainingDue) {
      throw new InvalidRequestError(
        `Payment amount (₹${(parsed.data.amountInPaise / 100).toFixed(2)}) cannot exceed the remaining due (₹${(remainingDue / 100).toFixed(2)}).`,
      );
    }

    const newAmountPaid = currentPaid + parsed.data.amountInPaise;
    const isFullyPaid = newAmountPaid >= order.totalInPaise;
    const newPaymentStatus = isFullyPaid ? PAYMENT_STATUS.PAID : PAYMENT_STATUS.PARTIALLY_PAID;

    const newEntry = {
      paymentMethod: parsed.data.paymentMethod,
      amountInPaise: parsed.data.amountInPaise,
      referenceNumber: parsed.data.referenceNumber,
      paymentDate: new Date(),
      verifiedByStaffId: new Types.ObjectId(staff.id),
      verifiedByName: staff.name,
      notes: parsed.data.notes,
      createdAt: new Date(),
    };

    order.paymentEntries.push(newEntry);
    order.amountPaidInPaise = newAmountPaid;
    order.paymentStatus = newPaymentStatus;
    await order.save();

    await recordAudit({
      actorStaffId: staff.id,
      actorRole: staff.role,
      action: AUDIT_ACTION.OFFLINE_PAYMENT_RECORDED,
      resource: "Order",
      resourceId: String(order._id),
      metadata: {
        orderNumber: order.orderNumber,
        amountInPaise: parsed.data.amountInPaise,
        paymentMethod: parsed.data.paymentMethod,
        newPaymentStatus,
      },
    });

    const updatedDetail = await getStaffOrderDetail(order.orderNumber, staff);
    return toSuccessResponse({ order: updatedDetail }, 201);
  } catch (error) {
    return toErrorResponse(error, "POST /api/pos/orders/[orderNumber]/payments failed");
  }
}

/**
 * Verify a pending offline payment (e.g. bank transfer / cheque clearance).
 * Requires PAYMENTS_VERIFY permission.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const staff = await requireStaffApi();
    if (!staff.effectivePermissions.includes(STAFF_PERMISSION.PAYMENTS_VERIFY)) {
      throw new ForbiddenError("You are not authorized to verify payments.");
    }

    const { orderNumber } = await params;
    const parsedBody = await readJsonBody(request, "PATCH /api/pos/orders/[orderNumber]/payments invalid JSON");
    if ("error" in parsedBody) return parsedBody.error;

    const parsed = verifyPaymentSchema.safeParse(parsedBody.body);
    if (!parsed.success) {
      return toErrorResponse(
        validationError(parsed.error),
        "PATCH /api/pos/orders/[orderNumber]/payments invalid body",
      );
    }

    await connectDB();
    const order = await Order.findOne({ orderNumber: orderNumber.trim().toUpperCase() });
    if (!order) throw new NotFoundError("Order not found.");

    if (order.paymentStatus !== PAYMENT_STATUS.PENDING_VERIFICATION) {
      throw new InvalidRequestError("Order does not have payments pending verification.");
    }

    // Mark as verified paid
    order.paymentStatus = PAYMENT_STATUS.PAID;
    order.amountPaidInPaise = order.totalInPaise;
    await order.save();

    await recordAudit({
      actorStaffId: staff.id,
      actorRole: staff.role,
      action: AUDIT_ACTION.OFFLINE_PAYMENT_VERIFIED,
      resource: "Order",
      resourceId: String(order._id),
      metadata: {
        orderNumber: order.orderNumber,
        verifiedByName: staff.name,
      },
    });

    const updatedDetail = await getStaffOrderDetail(order.orderNumber, staff);
    return toSuccessResponse({ order: updatedDetail });
  } catch (error) {
    return toErrorResponse(error, "PATCH /api/pos/orders/[orderNumber]/payments failed");
  }
}
