import "server-only";

import { Types } from "mongoose";

import { AUDIT_ACTION } from "@/lib/constants/audit";
import { ORDER_STATUS, PAYMENT_METHOD, REFUND_STATUS } from "@/lib/constants/order";
import { isAdminRole, isSellerRole } from "@/lib/constants/staff";
import { connectDB } from "@/lib/db/mongodb";
import { recordAuditLog } from "@/lib/services/audit.service";
import { toDatabaseError } from "@/lib/services/service-errors";
import {
  getBusinessDays,
  getBusinessTimezone,
} from "@/lib/utils/business-time";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  isAppError,
  isConnectionError,
} from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";
import {
  DailyClosing,
  type DailyClosingDocument,
  type DailyClosingSellerRow,
  type DailyClosingTenderRow,
} from "@/models/DailyClosing";
import { Expense, EXPENSE_STATUS } from "@/models/Expense";
import { Order } from "@/models/Order";
import type { StaffView } from "@/types/staff";

export interface LiveDailyCashSummary {
  closingDate: string;
  openingCashInPaise: number;
  cashSalesInPaise: number;
  cashDueCollectionsInPaise: number;
  cashRefundsInPaise: number;
  cashPaidOutInPaise: number;
  expectedClosingCashInPaise: number;
  sellerBreakdown: DailyClosingSellerRow[];
  tenderBreakdown: DailyClosingTenderRow[];
  alreadyClosed: boolean;
  existingClosing?: DailyClosingDocument | null;
}

export interface RecordDailyClosingInput {
  closingDate: string; // YYYY-MM-DD
  storeId?: string | null;
  openingCashInPaise?: number;
  actualCountedCashInPaise: number;
  notes?: string;
}

function generateClosingNumber(): string {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const date = new Date();
  const datePart = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("");
  let randomPart = "";
  for (let i = 0; i < 4; i += 1) {
    randomPart += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `CLS-${datePart}-${randomPart}`;
}

export function parseDateKeyToUtcRange(dateKey: string): { startUtc: Date; endUtc: Date } {
  const parts = dateKey.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    throw new BadRequestError(`Invalid dateKey format: ${dateKey}. Expected YYYY-MM-DD.`);
  }
  const [year, month, day] = parts;
  // Use business timezone midnight
  const timezone = getBusinessTimezone();
  // Guess midnight UTC offset
  const wallAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const getOffset = (d: Date) => {
    const p = formatter.formatToParts(d);
    const m = new Map(p.map((x) => [x.type, x.value]));
    const wall = Date.UTC(
      Number(m.get("year")),
      Number(m.get("month")) - 1,
      Number(m.get("day")),
      Number(m.get("hour")) % 24,
      Number(m.get("minute")),
      Number(m.get("second")),
    );
    return wall - d.getTime();
  };

  const initial = new Date(wallAsUtc - getOffset(new Date(wallAsUtc)));
  const startUtc = new Date(wallAsUtc - getOffset(initial));
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);

  return { startUtc, endUtc };
}

export async function getDailyCashSummary(
  dateKey: string,
  storeId?: string | null,
): Promise<LiveDailyCashSummary> {
  try {
    await connectDB();
  } catch (error) {
    throw toDatabaseError(error);
  }

  const { startUtc, endUtc } = parseDateKeyToUtcRange(dateKey);

  try {
    // 1. Check if closing already recorded
    const existing = await DailyClosing.findOne({
      closingDate: dateKey,
      storeId: storeId ?? null,
    }).lean<DailyClosingDocument>();

    // 2. Aggregate Cash & Tender Collections from Orders placed/paid today
    // Include all non-cancelled orders with payments in range
    const orders = await Order.find({
      status: { $ne: ORDER_STATUS.CANCELLED },
      $or: [
        { createdAt: { $gte: startUtc, $lt: endUtc } },
        { "paymentEntries.paymentDate": { $gte: startUtc, $lt: endUtc } },
      ],
    }).lean();

    let cashSalesInPaise = 0;
    const sellerMap = new Map<string, { staffId: Types.ObjectId; staffName: string; cashCollectedInPaise: number; orderCount: number }>();
    const tenderMap = new Map<string, { method: string; amountInPaise: number; count: number }>();

    for (const order of orders) {
      const sellerId = order.placedByStaffId ? String(order.placedByStaffId) : "unknown";
      const sellerName = order.placedByName || "Online / Counter";

      if (order.paymentEntries && order.paymentEntries.length > 0) {
        for (const entry of order.paymentEntries) {
          const entryDate = entry.paymentDate ? new Date(entry.paymentDate) : new Date(order.createdAt);
          if (entryDate >= startUtc && entryDate < endUtc) {
            const method = entry.paymentMethod || PAYMENT_METHOD.CASH;
            const amt = entry.amountInPaise || 0;

            // Tender map
            const tenderEntry = tenderMap.get(method) ?? { method, amountInPaise: 0, count: 0 };
            tenderEntry.amountInPaise += amt;
            tenderEntry.count += 1;
            tenderMap.set(method, tenderEntry);

            // Cash map
            if (method === PAYMENT_METHOD.CASH) {
              cashSalesInPaise += amt;
              const sellerEntry = sellerMap.get(sellerId) ?? {
                staffId: order.placedByStaffId ?? new Types.ObjectId(),
                staffName: sellerName,
                cashCollectedInPaise: 0,
                orderCount: 0,
              };
              sellerEntry.cashCollectedInPaise += amt;
              sellerEntry.orderCount += 1;
              sellerMap.set(sellerId, sellerEntry);
            }
          }
        }
      } else {
        // Fallback for orders created in range with single payment method
        const orderCreated = new Date(order.createdAt);
        if (orderCreated >= startUtc && orderCreated < endUtc && order.amountPaidInPaise > 0) {
          const method = order.paymentMethod || PAYMENT_METHOD.CASH;
          const amt = order.amountPaidInPaise;

          const tenderEntry = tenderMap.get(method) ?? { method, amountInPaise: 0, count: 0 };
          tenderEntry.amountInPaise += amt;
          tenderEntry.count += 1;
          tenderMap.set(method, tenderEntry);

          if (method === PAYMENT_METHOD.CASH) {
            cashSalesInPaise += amt;
            const sellerEntry = sellerMap.get(sellerId) ?? {
              staffId: order.placedByStaffId ?? new Types.ObjectId(),
              staffName: sellerName,
              cashCollectedInPaise: 0,
              orderCount: 0,
            };
            sellerEntry.cashCollectedInPaise += amt;
            sellerEntry.orderCount += 1;
            sellerMap.set(sellerId, sellerEntry);
          }
        }
      }
    }

    // 3. Aggregate Cash Refunds in range
    let cashRefundsInPaise = 0;
    const refundedOrders = await Order.find({
      "refunds.createdAt": { $gte: startUtc, $lt: endUtc },
    }).lean();

    for (const order of refundedOrders) {
      for (const ref of order.refunds ?? []) {
        const refDate = new Date(ref.createdAt);
        if (
          refDate >= startUtc &&
          refDate < endUtc &&
          ref.status === REFUND_STATUS.COMPLETED &&
          ref.refundMethod === PAYMENT_METHOD.CASH
        ) {
          cashRefundsInPaise += ref.amountInPaise;
        }
      }
    }

    // 4. Cash paid out (cash operating expenses)
    let cashPaidOutInPaise = 0;
    const cashExpenses = await Expense.find({
      expenseDate: { $gte: startUtc, $lt: endUtc },
      paymentMethod: "CASH",
      status: { $in: [EXPENSE_STATUS.APPROVED, EXPENSE_STATUS.PAID] },
    }).lean();

    for (const exp of cashExpenses) {
      cashPaidOutInPaise += exp.amountInPaise;
    }

    const openingCashInPaise = existing?.openingCashInPaise ?? 0;
    const expectedClosingCashInPaise =
      openingCashInPaise + cashSalesInPaise - cashRefundsInPaise - cashPaidOutInPaise;

    return {
      closingDate: dateKey,
      openingCashInPaise,
      cashSalesInPaise,
      cashDueCollectionsInPaise: 0,
      cashRefundsInPaise,
      cashPaidOutInPaise,
      expectedClosingCashInPaise,
      sellerBreakdown: Array.from(sellerMap.values()),
      tenderBreakdown: Array.from(tenderMap.values()),
      alreadyClosed: Boolean(existing),
      existingClosing: existing,
    };
  } catch (error) {
    if (isAppError(error)) throw error;
    if (!isConnectionError(error)) {
      logger.error("Failed to calculate live daily cash summary", error);
    }
    throw toDatabaseError(error);
  }
}

export async function recordDailyClosing(
  input: RecordDailyClosingInput,
  actor: StaffView,
): Promise<DailyClosingDocument> {
  if (isSellerRole(actor.role)) {
    throw new ForbiddenError("Sellers are not authorized to record daily cash closing.");
  }

  if (typeof input.actualCountedCashInPaise !== "number" || input.actualCountedCashInPaise < 0) {
    throw new BadRequestError("Actual counted cash must be a non-negative number in paise.");
  }

  const live = await getDailyCashSummary(input.closingDate, input.storeId);
  if (live.alreadyClosed) {
    throw new BadRequestError(`Daily closing for ${input.closingDate} has already been recorded and finalized.`);
  }

  const openingCashInPaise = input.openingCashInPaise ?? live.openingCashInPaise;
  const expectedClosingCashInPaise =
    openingCashInPaise + live.cashSalesInPaise - live.cashRefundsInPaise - live.cashPaidOutInPaise;
  const differenceInPaise = input.actualCountedCashInPaise - expectedClosingCashInPaise;

  try {
    const closing = await DailyClosing.create({
      closingNumber: generateClosingNumber(),
      closingDate: input.closingDate,
      businessDate: new Date(),
      storeId: input.storeId?.trim() || null,
      openingCashInPaise,
      cashSalesInPaise: live.cashSalesInPaise,
      cashDueCollectionsInPaise: live.cashDueCollectionsInPaise,
      cashRefundsInPaise: live.cashRefundsInPaise,
      cashPaidOutInPaise: live.cashPaidOutInPaise,
      expectedClosingCashInPaise,
      actualCountedCashInPaise: input.actualCountedCashInPaise,
      differenceInPaise,
      sellerBreakdown: live.sellerBreakdown,
      tenderBreakdown: live.tenderBreakdown,
      notes: input.notes?.trim() || "",
      closedByStaffId: new Types.ObjectId(actor.id),
      closedByName: actor.name,
      approvedByStaffId: isAdminRole(actor.role) ? new Types.ObjectId(actor.id) : null,
      approvedByName: isAdminRole(actor.role) ? actor.name : null,
      isFinalized: true,
    });

    await recordAuditLog({
      action: AUDIT_ACTION.DAILY_CLOSING_RECORDED,
      actor: { staffId: actor.id, role: actor.role, name: actor.name },
      target: { type: "DAILY_CLOSING", id: String(closing._id), label: closing.closingNumber },
      metadata: {
        closingDate: closing.closingDate,
        expectedClosingCashInPaise,
        actualCountedCashInPaise: closing.actualCountedCashInPaise,
        differenceInPaise,
      },
    });

    return closing;
  } catch (error) {
    if (isAppError(error)) throw error;
    if (!isConnectionError(error)) {
      logger.error("Failed to record daily closing", error);
    }
    throw toDatabaseError(error);
  }
}

export async function listDailyClosings(
  limit = 30,
): Promise<DailyClosingDocument[]> {
  try {
    await connectDB();
    return await DailyClosing.find()
      .sort({ closingDate: -1, createdAt: -1 })
      .limit(limit)
      .lean<DailyClosingDocument[]>();
  } catch (error) {
    throw toDatabaseError(error);
  }
}
