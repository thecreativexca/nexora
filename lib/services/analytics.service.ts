import "server-only";

import { Types } from "mongoose";

import {
  ORDER_STATUS,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  REFUND_STATUS,
} from "@/lib/constants/order";
import { isSellerRole } from "@/lib/constants/staff";
import { connectDB } from "@/lib/db/mongodb";
import { toDatabaseError } from "@/lib/services/service-errors";
import {
  getBusinessDays,
  getBusinessTimezone,
} from "@/lib/utils/business-time";
import {
  BadRequestError,
  ForbiddenError,
  isAppError,
  isConnectionError,
} from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";
import { Customer } from "@/models/Customer";
import { Expense, EXPENSE_STATUS } from "@/models/Expense";
import { Order } from "@/models/Order";
import { Product } from "@/models/Product";
import { PurchaseOrder, PURCHASE_ORDER_STATUS } from "@/models/PurchaseOrder";
import { StaffProfile } from "@/models/StaffProfile";
import { StockMovement } from "@/models/StockMovement";
import type { StaffView } from "@/types/staff";

export type DateRangePreset =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_7_days"
  | "this_month"
  | "prev_month"
  | "last_30_days"
  | "this_quarter"
  | "this_year"
  | "custom";

export interface ResolvedDateRange {
  preset: DateRangePreset;
  startUtc: Date;
  endUtc: Date;
  prevStartUtc: Date;
  prevEndUtc: Date;
  label: string;
  comparisonLabel: string;
}

/** Non-qualifying statuses excluded from gross and net sales */
const EXCLUDED_ORDER_STATUSES = [
  ORDER_STATUS.CANCELLED,
  ORDER_STATUS.REFUNDED,
] as const;

/**
 * Calculates start and end instants in the business timezone for a given preset
 * along with the matching previous period for comparison.
 */
export function resolveDateRange(
  preset: DateRangePreset = "this_month",
  customStart?: string | Date,
  customEnd?: string | Date,
): ResolvedDateRange {
  const timezone = getBusinessTimezone();
  const now = new Date();

  // Helper to format in business timezone
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

  const getParts = (d: Date) => {
    const parts = formatter.formatToParts(d);
    const m = new Map(parts.map((p) => [p.type, p.value]));
    return {
      year: Number(m.get("year")),
      month: Number(m.get("month")),
      day: Number(m.get("day")),
      hour: Number(m.get("hour")) % 24,
      minute: Number(m.get("minute")),
      second: Number(m.get("second")),
    };
  };

  const getOffset = (d: Date) => {
    const p = getParts(d);
    const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return wall - d.getTime();
  };

  const toUtc = (year: number, month: number, day: number, hour = 0, minute = 0, second = 0) => {
    const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
    const firstGuess = new Date(wallAsUtc - getOffset(new Date(wallAsUtc)));
    return new Date(wallAsUtc - getOffset(firstGuess));
  };

  const nowParts = getParts(now);

  let startUtc: Date;
  let endUtc: Date;
  let prevStartUtc: Date;
  let prevEndUtc: Date;
  let label = "";
  let comparisonLabel = "";

  switch (preset) {
    case "today": {
      startUtc = toUtc(nowParts.year, nowParts.month, nowParts.day, 0, 0, 0);
      endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);
      prevStartUtc = new Date(startUtc.getTime() - 24 * 60 * 60 * 1000);
      prevEndUtc = startUtc;
      label = "Today";
      comparisonLabel = "vs Yesterday";
      break;
    }
    case "yesterday": {
      endUtc = toUtc(nowParts.year, nowParts.month, nowParts.day, 0, 0, 0);
      startUtc = new Date(endUtc.getTime() - 24 * 60 * 60 * 1000);
      prevEndUtc = startUtc;
      prevStartUtc = new Date(startUtc.getTime() - 24 * 60 * 60 * 1000);
      label = "Yesterday";
      comparisonLabel = "vs Day Before";
      break;
    }
    case "last_7_days": {
      const todayStart = toUtc(nowParts.year, nowParts.month, nowParts.day, 0, 0, 0);
      endUtc = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
      startUtc = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
      const span = endUtc.getTime() - startUtc.getTime();
      prevEndUtc = startUtc;
      prevStartUtc = new Date(startUtc.getTime() - span);
      label = "Last 7 Days";
      comparisonLabel = "vs Prior 7 Days";
      break;
    }
    case "this_week": {
      // Find start of week (Monday)
      const dayOfWeek = (new Date(toUtc(nowParts.year, nowParts.month, nowParts.day)).getUTCDay() + 6) % 7; // Mon = 0
      const monday = new Date(toUtc(nowParts.year, nowParts.month, nowParts.day, 0, 0, 0).getTime() - dayOfWeek * 24 * 60 * 60 * 1000);
      startUtc = monday;
      endUtc = new Date(monday.getTime() + 7 * 24 * 60 * 60 * 1000);
      prevStartUtc = new Date(monday.getTime() - 7 * 24 * 60 * 60 * 1000);
      prevEndUtc = monday;
      label = "This Week";
      comparisonLabel = "vs Last Week";
      break;
    }
    case "last_30_days": {
      const todayStart = toUtc(nowParts.year, nowParts.month, nowParts.day, 0, 0, 0);
      endUtc = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
      startUtc = new Date(todayStart.getTime() - 29 * 24 * 60 * 60 * 1000);
      const span = endUtc.getTime() - startUtc.getTime();
      prevEndUtc = startUtc;
      prevStartUtc = new Date(startUtc.getTime() - span);
      label = "Last 30 Days";
      comparisonLabel = "vs Prior 30 Days";
      break;
    }
    case "this_month": {
      startUtc = toUtc(nowParts.year, nowParts.month, 1, 0, 0, 0);
      const nextMonthYear = nowParts.month === 12 ? nowParts.year + 1 : nowParts.year;
      const nextMonth = nowParts.month === 12 ? 1 : nowParts.month + 1;
      endUtc = toUtc(nextMonthYear, nextMonth, 1, 0, 0, 0);

      const prevMonthYear = nowParts.month === 1 ? nowParts.year - 1 : nowParts.year;
      const prevMonth = nowParts.month === 1 ? 12 : nowParts.month - 1;
      prevStartUtc = toUtc(prevMonthYear, prevMonth, 1, 0, 0, 0);
      prevEndUtc = startUtc;
      label = "This Month";
      comparisonLabel = "vs Previous Month";
      break;
    }
    case "prev_month": {
      const pmYear = nowParts.month === 1 ? nowParts.year - 1 : nowParts.year;
      const pm = nowParts.month === 1 ? 12 : nowParts.month - 1;
      startUtc = toUtc(pmYear, pm, 1, 0, 0, 0);
      endUtc = toUtc(nowParts.year, nowParts.month, 1, 0, 0, 0);

      const ppmYear = pm === 1 ? pmYear - 1 : pmYear;
      const ppm = pm === 1 ? 12 : pm - 1;
      prevStartUtc = toUtc(ppmYear, ppm, 1, 0, 0, 0);
      prevEndUtc = startUtc;
      label = "Previous Month";
      comparisonLabel = "vs Prior Month";
      break;
    }
    case "this_quarter": {
      const qMonth = Math.floor((nowParts.month - 1) / 3) * 3 + 1;
      startUtc = toUtc(nowParts.year, qMonth, 1, 0, 0, 0);
      const endQMonth = qMonth + 3;
      const eqYear = endQMonth > 12 ? nowParts.year + 1 : nowParts.year;
      const eqM = endQMonth > 12 ? endQMonth - 12 : endQMonth;
      endUtc = toUtc(eqYear, eqM, 1, 0, 0, 0);

      const pqMonth = qMonth - 3;
      const pqYear = pqMonth <= 0 ? nowParts.year - 1 : nowParts.year;
      const pqM = pqMonth <= 0 ? pqMonth + 12 : pqMonth;
      prevStartUtc = toUtc(pqYear, pqM, 1, 0, 0, 0);
      prevEndUtc = startUtc;
      label = "This Quarter";
      comparisonLabel = "vs Previous Quarter";
      break;
    }
    case "this_year": {
      startUtc = toUtc(nowParts.year, 1, 1, 0, 0, 0);
      endUtc = toUtc(nowParts.year + 1, 1, 1, 0, 0, 0);
      prevStartUtc = toUtc(nowParts.year - 1, 1, 1, 0, 0, 0);
      prevEndUtc = startUtc;
      label = "This Year";
      comparisonLabel = "vs Previous Year";
      break;
    }
    case "custom":
    default: {
      if (!customStart || !customEnd) {
        // Default to last 30 days if custom dates not provided
        return resolveDateRange("last_30_days");
      }
      startUtc = new Date(customStart);
      endUtc = new Date(customEnd);
      if (Number.isNaN(startUtc.getTime()) || Number.isNaN(endUtc.getTime())) {
        throw new BadRequestError("Invalid custom date range specified.");
      }
      if (startUtc >= endUtc) {
        throw new BadRequestError("Start date must be before end date.");
      }
      const span = endUtc.getTime() - startUtc.getTime();
      prevEndUtc = new Date(startUtc.getTime());
      prevStartUtc = new Date(startUtc.getTime() - span);
      label = `${startUtc.toISOString().slice(0, 10)} to ${endUtc.toISOString().slice(0, 10)}`;
      comparisonLabel = "vs Prior Period";
      break;
    }
  }

  return {
    preset,
    startUtc,
    endUtc,
    prevStartUtc,
    prevEndUtc,
    label,
    comparisonLabel,
  };
}

/** Safe growth percentage helper avoiding division by zero or Infinity */
export function calculateGrowthPercentage(
  current: number,
  previous: number,
): number | null {
  if (previous === 0) {
    return current === 0 ? 0 : null; // null represents undefined growth (e.g. from 0 to N)
  }
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/* ---------------------------------------------------------------------------
 * Admin Business Overview KPIs (Section 3)
 * ------------------------------------------------------------------------- */

export interface AdminOverviewKpiResult {
  generatedAt: string;
  timezone: string;
  range: ResolvedDateRange;
  // 1. Sales & Revenue
  totalSalesInPaise: number;
  grossSalesInPaise: number;
  netSalesInPaise: number;
  totalDiscountsInPaise: number;
  collectedPaymentsInPaise: number;
  outstandingCustomerDuesInPaise: number;
  // 2. Orders & Refunds
  totalOrdersCount: number;
  completedOrdersCount: number;
  cancelledOrdersCount: number;
  totalRefundsInPaise: number;
  refundedOrdersCount: number;
  // 3. Profitability
  costOfGoodsSoldInPaise: number;
  grossProfitInPaise: number;
  grossProfitMarginPercent: number;
  operatingExpensesInPaise: number;
  netProfitInPaise: number | null;
  isNetProfitAvailable: boolean;
  taxCollectedInPaise: number;
  // 4. Inventory Assets
  totalProductsCount: number;
  lowStockProductsCount: number;
  outOfStockProductsCount: number;
  inventoryValuationInPaise: number;
  // 5. Customer & Staff Engagement
  activeCustomersCount: number;
  activeSellersCount: number;
  activeManagersCount: number;
  pendingApprovalsCount: number;
  // Comparisons vs Previous Equivalent Period
  growth: {
    salesGrowthPercent: number | null;
    ordersGrowthPercent: number | null;
    collectionsGrowthPercent: number | null;
    grossProfitGrowthPercent: number | null;
    previousNetSalesInPaise: number;
    previousOrdersCount: number;
    previousCollectedPaymentsInPaise: number;
    previousGrossProfitInPaise: number;
  };
}

export async function getAdminOverviewKpis(
  rangePreset: DateRangePreset = "this_month",
  customStart?: string,
  customEnd?: string,
  storeId?: string | null,
  actor?: StaffView,
): Promise<AdminOverviewKpiResult> {
  try {
    await connectDB();
  } catch (error) {
    throw toDatabaseError(error);
  }

  const range = resolveDateRange(rangePreset, customStart, customEnd);
  const timezone = getBusinessTimezone();

  // Role scoping: Seller can only see their own sales
  const staffMatch: Record<string, unknown> = {};
  if (actor && isSellerRole(actor.role)) {
    staffMatch.placedByStaffId = new Types.ObjectId(actor.id);
  }

  try {
    // 1. Current Period Orders Aggregation
    const currentOrdersPromise = Order.aggregate([
      {
        $match: {
          createdAt: { $gte: range.startUtc, $lt: range.endUtc },
          ...staffMatch,
        },
      },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          completedOrders: {
            $sum: {
              $cond: [
                { $in: ["$status", [ORDER_STATUS.COMPLETED, ORDER_STATUS.DELIVERED]] },
                1,
                0,
              ],
            },
          },
          cancelledOrders: {
            $sum: { $cond: [{ $eq: ["$status", ORDER_STATUS.CANCELLED] }, 1, 0] },
          },
          refundedOrders: {
            $sum: { $cond: [{ $eq: ["$status", ORDER_STATUS.REFUNDED] }, 1, 0] },
          },
          totalSales: {
            $sum: {
              $cond: [
                { $in: ["$status", EXCLUDED_ORDER_STATUSES] },
                0,
                "$totalInPaise",
              ],
            },
          },
          subtotal: {
            $sum: {
              $cond: [
                { $in: ["$status", EXCLUDED_ORDER_STATUSES] },
                0,
                "$subtotalInPaise",
              ],
            },
          },
          discounts: {
            $sum: {
              $cond: [
                { $in: ["$status", EXCLUDED_ORDER_STATUSES] },
                0,
                "$discountInPaise",
              ],
            },
          },
          taxCollected: {
            $sum: {
              $cond: [
                { $in: ["$status", EXCLUDED_ORDER_STATUSES] },
                0,
                "$taxInPaise",
              ],
            },
          },
          refundedTotal: { $sum: "$refundedTotalInPaise" },
          amountPaid: {
            $sum: {
              $cond: [
                { $eq: ["$status", ORDER_STATUS.CANCELLED] },
                0,
                "$amountPaidInPaise",
              ],
            },
          },
        },
      },
    ]);

    // 2. Previous Period Orders Aggregation (for comparative growth)
    const prevOrdersPromise = Order.aggregate([
      {
        $match: {
          createdAt: { $gte: range.prevStartUtc, $lt: range.prevEndUtc },
          ...staffMatch,
        },
      },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalSales: {
            $sum: {
              $cond: [
                { $in: ["$status", EXCLUDED_ORDER_STATUSES] },
                0,
                "$totalInPaise",
              ],
            },
          },
          discounts: {
            $sum: {
              $cond: [
                { $in: ["$status", EXCLUDED_ORDER_STATUSES] },
                0,
                "$discountInPaise",
              ],
            },
          },
          refundedTotal: { $sum: "$refundedTotalInPaise" },
          amountPaid: {
            $sum: {
              $cond: [
                { $eq: ["$status", ORDER_STATUS.CANCELLED] },
                0,
                "$amountPaidInPaise",
              ],
            },
          },
        },
      },
    ]);

    // 3. COGS Aggregation for Current Period
    // Aggregate sold items from qualifying orders in current range
    const cogsPromise = Order.aggregate([
      {
        $match: {
          createdAt: { $gte: range.startUtc, $lt: range.endUtc },
          status: { $nin: EXCLUDED_ORDER_STATUSES },
          ...staffMatch,
        },
      },
      { $unwind: "$items" },
      {
        $lookup: {
          from: "products",
          localField: "items.productId",
          foreignField: "_id",
          as: "productDoc",
        },
      },
      {
        $project: {
          quantity: "$items.quantity",
          costInPaise: {
            $ifNull: [{ $arrayElemAt: ["$productDoc.costInPaise", 0] }, 0],
          },
        },
      },
      {
        $group: {
          _id: null,
          cogsInPaise: { $sum: { $multiply: ["$quantity", "$costInPaise"] } },
        },
      },
    ]);

    // 4. COGS Aggregation for Previous Period
    const prevCogsPromise = Order.aggregate([
      {
        $match: {
          createdAt: { $gte: range.prevStartUtc, $lt: range.prevEndUtc },
          status: { $nin: EXCLUDED_ORDER_STATUSES },
          ...staffMatch,
        },
      },
      { $unwind: "$items" },
      {
        $lookup: {
          from: "products",
          localField: "items.productId",
          foreignField: "_id",
          as: "productDoc",
        },
      },
      {
        $project: {
          quantity: "$items.quantity",
          costInPaise: {
            $ifNull: [{ $arrayElemAt: ["$productDoc.costInPaise", 0] }, 0],
          },
        },
      },
      {
        $group: {
          _id: null,
          cogsInPaise: { $sum: { $multiply: ["$quantity", "$costInPaise"] } },
        },
      },
    ]);

    // 5. Operating Expenses in Current Period
    const expensesPromise = Expense.aggregate([
      {
        $match: {
          expenseDate: { $gte: range.startUtc, $lt: range.endUtc },
          status: { $in: [EXPENSE_STATUS.APPROVED, EXPENSE_STATUS.PAID] },
          ...(storeId ? { storeId } : {}),
        },
      },
      {
        $group: {
          _id: null,
          totalExpenses: { $sum: "$amountInPaise" },
          count: { $sum: 1 },
        },
      },
    ]);

    // 6. Outstanding customer dues
    const duesPromise = Customer.aggregate([
      {
        $group: {
          _id: null,
          totalDues: { $sum: "$outstandingDueInPaise" },
        },
      },
    ]);

    // 7. Inventory & Product Statuses
    const inventoryPromise = Product.aggregate([
      {
        $match: { isActive: true },
      },
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          lowStock: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$isService", false] },
                    { $gt: ["$stock", 0] },
                    { $lte: ["$stock", "$minStockThreshold"] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          outOfStock: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$isService", false] },
                    { $eq: ["$stock", 0] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          inventoryValuation: {
            $sum: {
              $cond: [
                { $eq: ["$isService", false] },
                { $multiply: ["$stock", { $ifNull: ["$costInPaise", 0] }] },
                0,
              ],
            },
          },
        },
      },
    ]);

    // 8. Staff counts
    const staffPromise = StaffProfile.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: "$role",
          count: { $sum: 1 },
        },
      },
    ]);

    // 9. Active Customers count
    const customerCountPromise = Customer.countDocuments({ isActive: true });

    // 10. Pending Approvals
    // (Pending refunds + pending POs + pending payment verifications)
    const pendingRefundsPromise = Order.countDocuments({
      "refunds.status": REFUND_STATUS.REQUESTED,
    });
    const pendingPosPromise = PurchaseOrder.countDocuments({
      status: PURCHASE_ORDER_STATUS.PENDING_APPROVAL,
    });
    const pendingPaymentsPromise = Order.countDocuments({
      paymentStatus: PAYMENT_STATUS.PENDING_VERIFICATION,
    });

    // Execute queries in parallel
    const [
      currentOrdersRes,
      prevOrdersRes,
      cogsRes,
      prevCogsRes,
      expensesRes,
      duesRes,
      inventoryRes,
      staffRes,
      customerCount,
      pendingRefunds,
      pendingPos,
      pendingPayments,
    ] = await Promise.all([
      currentOrdersPromise,
      prevOrdersPromise,
      cogsPromise,
      prevCogsPromise,
      expensesPromise,
      duesPromise,
      inventoryPromise,
      staffPromise,
      customerCountPromise,
      pendingRefundsPromise,
      pendingPosPromise,
      pendingPaymentsPromise,
    ]);

    const cur = currentOrdersRes[0] ?? {
      totalOrders: 0,
      completedOrders: 0,
      cancelledOrders: 0,
      refundedOrders: 0,
      totalSales: 0,
      subtotal: 0,
      discounts: 0,
      taxCollected: 0,
      refundedTotal: 0,
      amountPaid: 0,
    };

    const prev = prevOrdersRes[0] ?? {
      totalOrders: 0,
      totalSales: 0,
      discounts: 0,
      refundedTotal: 0,
      amountPaid: 0,
    };

    const cogsInPaise = cogsRes[0]?.cogsInPaise ?? 0;
    const prevCogsInPaise = prevCogsRes[0]?.cogsInPaise ?? 0;

    const grossSalesInPaise = cur.subtotal;
    const totalDiscountsInPaise = cur.discounts;
    const totalRefundsInPaise = cur.refundedTotal;
    const totalSalesInPaise = cur.totalSales;
    const netSalesInPaise = Math.max(0, grossSalesInPaise - totalDiscountsInPaise - totalRefundsInPaise);

    const prevGrossSales = prev.totalSales;
    const prevNetSales = Math.max(0, prevGrossSales - prev.discounts - prev.refundedTotal);

    const grossProfitInPaise = netSalesInPaise - cogsInPaise;
    const prevGrossProfitInPaise = prevNetSales - prevCogsInPaise;

    const grossProfitMarginPercent =
      netSalesInPaise > 0
        ? Math.round((grossProfitInPaise / netSalesInPaise) * 1000) / 10
        : 0;

    const operatingExpensesInPaise = expensesRes[0]?.totalExpenses ?? 0;
    const expenseCount = expensesRes[0]?.count ?? 0;
    const isNetProfitAvailable = expenseCount > 0;
    const netProfitInPaise = isNetProfitAvailable
      ? grossProfitInPaise - operatingExpensesInPaise
      : null;

    const inv = inventoryRes[0] ?? {
      totalProducts: 0,
      lowStock: 0,
      outOfStock: 0,
      inventoryValuation: 0,
    };

    let activeSellersCount = 0;
    let activeManagersCount = 0;
    for (const s of staffRes) {
      if (s._id === "SELLER" || s._id === "CASHIER") activeSellersCount += s.count;
      if (s._id === "MANAGER") activeManagersCount += s.count;
    }

    const pendingApprovalsCount = pendingRefunds + pendingPos + pendingPayments;

    return {
      generatedAt: new Date().toISOString(),
      timezone,
      range,
      totalSalesInPaise,
      grossSalesInPaise,
      netSalesInPaise,
      totalDiscountsInPaise,
      collectedPaymentsInPaise: cur.amountPaid,
      outstandingCustomerDuesInPaise: duesRes[0]?.totalDues ?? 0,
      totalOrdersCount: cur.totalOrders,
      completedOrdersCount: cur.completedOrders,
      cancelledOrdersCount: cur.cancelledOrders,
      totalRefundsInPaise,
      refundedOrdersCount: cur.refundedOrders,
      costOfGoodsSoldInPaise: cogsInPaise,
      grossProfitInPaise,
      grossProfitMarginPercent,
      operatingExpensesInPaise,
      netProfitInPaise,
      isNetProfitAvailable,
      taxCollectedInPaise: cur.taxCollected,
      totalProductsCount: inv.totalProducts,
      lowStockProductsCount: inv.lowStock,
      outOfStockProductsCount: inv.outOfStock,
      inventoryValuationInPaise: inv.inventoryValuation,
      activeCustomersCount: customerCount,
      activeSellersCount,
      activeManagersCount,
      pendingApprovalsCount,
      growth: {
        salesGrowthPercent: calculateGrowthPercentage(netSalesInPaise, prevNetSales),
        ordersGrowthPercent: calculateGrowthPercentage(cur.totalOrders, prev.totalOrders),
        collectionsGrowthPercent: calculateGrowthPercentage(cur.amountPaid, prev.amountPaid),
        grossProfitGrowthPercent: calculateGrowthPercentage(grossProfitInPaise, prevGrossProfitInPaise),
        previousNetSalesInPaise: prevNetSales,
        previousOrdersCount: prev.totalOrders,
        previousCollectedPaymentsInPaise: prev.amountPaid,
        previousGrossProfitInPaise: prevGrossProfitInPaise,
      },
    };
  } catch (error) {
    if (isAppError(error)) throw error;
    if (!isConnectionError(error)) {
      logger.error("Failed to aggregate Admin Overview KPIs", error);
    }
    throw toDatabaseError(error);
  }
}

/* ---------------------------------------------------------------------------
 * Advanced Sales Analytics & Charts (Section 4)
 * ------------------------------------------------------------------------- */

export interface SalesTrendPoint {
  dateKey: string;
  label: string;
  grossSalesInPaise: number;
  netSalesInPaise: number;
  orderCount: number;
  cogsInPaise: number;
  grossProfitInPaise: number;
}

export interface CategorySalesContribution {
  categoryId: string;
  categoryName: string;
  orderCount: number;
  quantitySold: number;
  revenueInPaise: number;
  percentage: number;
}

export interface ProductSalesContribution {
  productId: string;
  productName: string;
  sku: string;
  quantitySold: number;
  revenueInPaise: number;
  grossProfitInPaise: number;
}

export interface SellerSalesContribution {
  sellerId: string;
  sellerName: string;
  orderCount: number;
  totalSalesInPaise: number;
  collectedInPaise: number;
}

export interface SalesAnalyticsResult {
  range: ResolvedDateRange;
  grossSalesInPaise: number;
  totalDiscountsInPaise: number;
  salesReturnsInPaise: number;
  netSalesInPaise: number;
  orderCount: number;
  itemsSoldCount: number;
  averageOrderValueInPaise: number;
  salesGrowthPercent: number | null;
  refundRatePercent: number;
  cancellationRatePercent: number;
  trends: SalesTrendPoint[];
  categoryBreakdown: CategorySalesContribution[];
  topProducts: ProductSalesContribution[];
  sellerBreakdown: SellerSalesContribution[];
}

export async function getSalesAnalytics(
  rangePreset: DateRangePreset = "last_7_days",
  customStart?: string,
  customEnd?: string,
  actor?: StaffView,
): Promise<SalesAnalyticsResult> {
  try {
    await connectDB();
  } catch (error) {
    throw toDatabaseError(error);
  }

  const range = resolveDateRange(rangePreset, customStart, customEnd);
  const timezone = getBusinessTimezone();

  const staffMatch: Record<string, unknown> = {};
  if (actor && isSellerRole(actor.role)) {
    staffMatch.placedByStaffId = new Types.ObjectId(actor.id);
  }

  try {
    // 1. Overview KPIs in range
    const overview = await getAdminOverviewKpis(
      rangePreset,
      customStart,
      customEnd,
      null,
      actor,
    );

    // 2. Trend grouping: group orders by day in business timezone
    const trendAgg = await Order.aggregate<{
      _id: string;
      grossSales: number;
      netSales: number;
      orderCount: number;
    }>([
      {
        $match: {
          createdAt: { $gte: range.startUtc, $lt: range.endUtc },
          status: { $nin: EXCLUDED_ORDER_STATUSES },
          ...staffMatch,
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone },
          },
          grossSales: { $sum: "$subtotalInPaise" },
          netSales: { $sum: "$totalInPaise" },
          orderCount: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const trendMap = new Map(trendAgg.map((t) => [t._id, t]));

    // Generate consecutive days inside range if within 31 days
    const msInDay = 24 * 60 * 60 * 1000;
    const daySpan = Math.ceil((range.endUtc.getTime() - range.startUtc.getTime()) / msInDay);
    const trends: SalesTrendPoint[] = [];

    if (daySpan <= 31) {
      const days = getBusinessDays(Math.max(1, daySpan), new Date(range.endUtc.getTime() - 1000));
      for (const d of days) {
        const found = trendMap.get(d.dateKey);
        trends.push({
          dateKey: d.dateKey,
          label: d.label,
          grossSalesInPaise: found?.grossSales ?? 0,
          netSalesInPaise: found?.netSales ?? 0,
          orderCount: found?.orderCount ?? 0,
          cogsInPaise: 0,
          grossProfitInPaise: 0,
        });
      }
    } else {
      for (const t of trendAgg) {
        trends.push({
          dateKey: t._id,
          label: t._id,
          grossSalesInPaise: t.grossSales,
          netSalesInPaise: t.netSales,
          orderCount: t.orderCount,
          cogsInPaise: 0,
          grossProfitInPaise: 0,
        });
      }
    }

    // 3. Category Breakdown
    const categoryAgg = await Order.aggregate<{
      _id: Types.ObjectId;
      orderCount: number;
      quantitySold: number;
      revenue: number;
      categoryName: string;
    }>([
      {
        $match: {
          createdAt: { $gte: range.startUtc, $lt: range.endUtc },
          status: { $nin: EXCLUDED_ORDER_STATUSES },
          ...staffMatch,
        },
      },
      { $unwind: "$items" },
      {
        $lookup: {
          from: "products",
          localField: "items.productId",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "categories",
          localField: "product.category",
          foreignField: "_id",
          as: "category",
        },
      },
      { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: "$product.category",
          categoryName: { $first: "$category.name" },
          orderCount: { $sum: 1 },
          quantitySold: { $sum: "$items.quantity" },
          revenue: { $sum: "$items.lineTotalInPaise" },
        },
      },
      { $sort: { revenue: -1 } },
    ]);

    const totalCategoryRevenue = categoryAgg.reduce((acc, c) => acc + c.revenue, 0);
    const categoryBreakdown: CategorySalesContribution[] = categoryAgg.map((c) => ({
      categoryId: String(c._id ?? "uncategorized"),
      categoryName: c.categoryName || "Uncategorized",
      orderCount: c.orderCount,
      quantitySold: c.quantitySold,
      revenueInPaise: c.revenue,
      percentage:
        totalCategoryRevenue > 0
          ? Math.round((c.revenue / totalCategoryRevenue) * 1000) / 10
          : 0,
    }));

    // 4. Top Selling Products
    const productAgg = await Order.aggregate<{
      _id: Types.ObjectId;
      productName: string;
      sku: string;
      quantitySold: number;
      revenue: number;
      cost: number;
    }>([
      {
        $match: {
          createdAt: { $gte: range.startUtc, $lt: range.endUtc },
          status: { $nin: EXCLUDED_ORDER_STATUSES },
          ...staffMatch,
        },
      },
      { $unwind: "$items" },
      {
        $lookup: {
          from: "products",
          localField: "items.productId",
          foreignField: "_id",
          as: "productDoc",
        },
      },
      {
        $project: {
          productId: "$items.productId",
          productName: "$items.productName",
          sku: "$items.sku",
          quantity: "$items.quantity",
          lineTotal: "$items.lineTotalInPaise",
          costInPaise: {
            $ifNull: [{ $arrayElemAt: ["$productDoc.costInPaise", 0] }, 0],
          },
        },
      },
      {
        $group: {
          _id: "$productId",
          productName: { $first: "$productName" },
          sku: { $first: "$sku" },
          quantitySold: { $sum: "$quantity" },
          revenue: { $sum: "$lineTotal" },
          cost: { $sum: { $multiply: ["$quantity", "$costInPaise"] } },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 10 },
    ]);

    const topProducts: ProductSalesContribution[] = productAgg.map((p) => ({
      productId: String(p._id),
      productName: p.productName,
      sku: p.sku,
      quantitySold: p.quantitySold,
      revenueInPaise: p.revenue,
      grossProfitInPaise: p.revenue - p.cost,
    }));

    // 5. Total Items Sold
    let itemsSoldCount = 0;
    for (const p of categoryAgg) {
      itemsSoldCount += p.quantitySold;
    }

    // 6. Seller Breakdown (unless Seller role is restricted to own)
    const sellerAgg = await Order.aggregate<{
      _id: Types.ObjectId | null;
      sellerName: string;
      orderCount: number;
      totalSales: number;
      collected: number;
    }>([
      {
        $match: {
          createdAt: { $gte: range.startUtc, $lt: range.endUtc },
          status: { $nin: EXCLUDED_ORDER_STATUSES },
          ...staffMatch,
        },
      },
      {
        $group: {
          _id: "$placedByStaffId",
          sellerName: { $first: "$placedByName" },
          orderCount: { $sum: 1 },
          totalSales: { $sum: "$totalInPaise" },
          collected: { $sum: "$amountPaidInPaise" },
        },
      },
      { $sort: { totalSales: -1 } },
    ]);

    const sellerBreakdown: SellerSalesContribution[] = sellerAgg.map((s) => ({
      sellerId: s._id ? String(s._id) : "online",
      sellerName: s.sellerName || "Storefront / Web",
      orderCount: s.orderCount,
      totalSalesInPaise: s.totalSales,
      collectedInPaise: s.collected,
    }));

    const aov =
      overview.totalOrdersCount > 0
        ? Math.round(overview.netSalesInPaise / overview.totalOrdersCount)
        : 0;

    const refundRate =
      overview.totalOrdersCount > 0
        ? Math.round((overview.refundedOrdersCount / overview.totalOrdersCount) * 1000) / 10
        : 0;

    const cancellationRate =
      overview.totalOrdersCount > 0
        ? Math.round((overview.cancelledOrdersCount / overview.totalOrdersCount) * 1000) / 10
        : 0;

    return {
      range,
      grossSalesInPaise: overview.grossSalesInPaise,
      totalDiscountsInPaise: overview.totalDiscountsInPaise,
      salesReturnsInPaise: overview.totalRefundsInPaise,
      netSalesInPaise: overview.netSalesInPaise,
      orderCount: overview.totalOrdersCount,
      itemsSoldCount,
      averageOrderValueInPaise: aov,
      salesGrowthPercent: overview.growth.salesGrowthPercent,
      refundRatePercent: refundRate,
      cancellationRatePercent: cancellationRate,
      trends,
      categoryBreakdown,
      topProducts,
      sellerBreakdown,
    };
  } catch (error) {
    if (isAppError(error)) throw error;
    if (!isConnectionError(error)) {
      logger.error("Failed to aggregate Sales Analytics", error);
    }
    throw toDatabaseError(error);
  }
}

/* ---------------------------------------------------------------------------
 * Financial Analytics & P&L Statement (Section 5)
 * ------------------------------------------------------------------------- */

export interface FinancialAnalyticsResult {
  range: ResolvedDateRange;
  grossSalesInPaise: number;
  discountsInPaise: number;
  salesReturnsInPaise: number;
  netSalesInPaise: number;
  costOfGoodsSoldInPaise: number;
  grossProfitInPaise: number;
  grossProfitMarginPercent: number;
  operatingExpensesInPaise: number;
  operatingExpensesByCategory: Record<string, number>;
  netProfitInPaise: number | null;
  netProfitMarginPercent: number | null;
  isExpenseDataComplete: boolean;
  totalCollectedPaymentsInPaise: number;
  refundPaymentsInPaise: number;
  netCollectionsInPaise: number;
  outstandingReceivablesInPaise: number;
  supplierPayablesInPaise: number;
  taxCollectedInPaise: number;
}

export async function getFinancialAnalytics(
  rangePreset: DateRangePreset = "this_month",
  customStart?: string,
  customEnd?: string,
  storeId?: string | null,
  actor?: StaffView,
): Promise<FinancialAnalyticsResult> {
  if (actor && isSellerRole(actor.role)) {
    throw new ForbiddenError("Sellers are not authorized to view financial P&L analytics.");
  }

  try {
    await connectDB();
  } catch (error) {
    throw toDatabaseError(error);
  }

  const overview = await getAdminOverviewKpis(
    rangePreset,
    customStart,
    customEnd,
    storeId,
    actor,
  );

  // Supplier payables (PO dues)
  const poDuesAgg = await PurchaseOrder.aggregate<{ _id: null; totalPayables: number }>([
    {
      $match: {
        status: { $nin: [PURCHASE_ORDER_STATUS.CANCELLED, PURCHASE_ORDER_STATUS.DRAFT] },
      },
    },
    {
      $group: {
        _id: null,
        totalPayables: {
          $sum: { $subtract: ["$totalInPaise", "$amountPaidInPaise"] },
        },
      },
    },
  ]);
  const supplierPayablesInPaise = Math.max(0, poDuesAgg[0]?.totalPayables ?? 0);

  // Detailed expenses breakdown
  const expBreakdown = await Expense.aggregate<{ _id: string; total: number }>([
    {
      $match: {
        expenseDate: { $gte: overview.range.startUtc, $lt: overview.range.endUtc },
        status: { $in: [EXPENSE_STATUS.APPROVED, EXPENSE_STATUS.PAID] },
        ...(storeId ? { storeId } : {}),
      },
    },
    {
      $group: {
        _id: "$category",
        total: { $sum: "$amountInPaise" },
      },
    },
  ]);

  const expensesByCategory: Record<string, number> = {};
  for (const eb of expBreakdown) {
    expensesByCategory[eb._id] = eb.total;
  }

  const netCollectionsInPaise =
    overview.collectedPaymentsInPaise - overview.totalRefundsInPaise;

  const netProfitMarginPercent =
    overview.netProfitInPaise !== null && overview.netSalesInPaise > 0
      ? Math.round((overview.netProfitInPaise / overview.netSalesInPaise) * 1000) / 10
      : null;

  return {
    range: overview.range,
    grossSalesInPaise: overview.grossSalesInPaise,
    discountsInPaise: overview.totalDiscountsInPaise,
    salesReturnsInPaise: overview.totalRefundsInPaise,
    netSalesInPaise: overview.netSalesInPaise,
    costOfGoodsSoldInPaise: overview.costOfGoodsSoldInPaise,
    grossProfitInPaise: overview.grossProfitInPaise,
    grossProfitMarginPercent: overview.grossProfitMarginPercent,
    operatingExpensesInPaise: overview.operatingExpensesInPaise,
    operatingExpensesByCategory: expensesByCategory,
    netProfitInPaise: overview.netProfitInPaise,
    netProfitMarginPercent,
    isExpenseDataComplete: overview.isNetProfitAvailable,
    totalCollectedPaymentsInPaise: overview.collectedPaymentsInPaise,
    refundPaymentsInPaise: overview.totalRefundsInPaise,
    netCollectionsInPaise,
    outstandingReceivablesInPaise: overview.outstandingCustomerDuesInPaise,
    supplierPayablesInPaise,
    taxCollectedInPaise: overview.taxCollectedInPaise,
  };
}

/* ---------------------------------------------------------------------------
 * Offline Payment Analytics (Section 7)
 * ------------------------------------------------------------------------- */

export interface PaymentTenderMetric {
  method: string;
  confirmedInPaise: number;
  pendingInPaise: number;
  transactionCount: number;
}

export interface OfflinePaymentAnalyticsResult {
  range: ResolvedDateRange;
  totalCollectedInPaise: number;
  confirmedCollectionsInPaise: number;
  pendingVerificationInPaise: number;
  refundPaymentsInPaise: number;
  netCollectionsInPaise: number;
  outstandingCustomerDuesInPaise: number;
  tenderBreakdown: PaymentTenderMetric[];
  orderPaymentStatusBreakdown: {
    paidCount: number;
    partiallyPaidCount: number;
    unpaidCount: number;
    pendingVerificationCount: number;
    refundedCount: number;
  };
  sellerCollections: {
    sellerId: string;
    sellerName: string;
    collectedInPaise: number;
    orderCount: number;
  }[];
}

export async function getOfflinePaymentAnalytics(
  rangePreset: DateRangePreset = "this_month",
  customStart?: string,
  customEnd?: string,
  actor?: StaffView,
): Promise<OfflinePaymentAnalyticsResult> {
  try {
    await connectDB();
  } catch (error) {
    throw toDatabaseError(error);
  }

  const range = resolveDateRange(rangePreset, customStart, customEnd);

  const staffMatch: Record<string, unknown> = {};
  if (actor && isSellerRole(actor.role)) {
    staffMatch.placedByStaffId = new Types.ObjectId(actor.id);
  }

  try {
    // 1. Orders in range
    const orders = await Order.find({
      status: { $ne: ORDER_STATUS.CANCELLED },
      createdAt: { $gte: range.startUtc, $lt: range.endUtc },
      ...staffMatch,
    }).lean();

    const tenderMap = new Map<string, PaymentTenderMetric>();
    const sellerMap = new Map<string, { sellerId: string; sellerName: string; collectedInPaise: number; orderCount: number }>();

    let totalCollectedInPaise = 0;
    let pendingVerificationInPaise = 0;
    let totalRefundsInPaise = 0;

    const statusCounts = {
      paidCount: 0,
      partiallyPaidCount: 0,
      unpaidCount: 0,
      pendingVerificationCount: 0,
      refundedCount: 0,
    };

    for (const order of orders) {
      totalRefundsInPaise += order.refundedTotalInPaise ?? 0;

      // Status breakdown
      if (order.paymentStatus === PAYMENT_STATUS.PAID) statusCounts.paidCount += 1;
      else if (order.paymentStatus === PAYMENT_STATUS.PARTIALLY_PAID) statusCounts.partiallyPaidCount += 1;
      else if (order.paymentStatus === PAYMENT_STATUS.UNPAID) statusCounts.unpaidCount += 1;
      else if (order.paymentStatus === PAYMENT_STATUS.PENDING_VERIFICATION) statusCounts.pendingVerificationCount += 1;
      else if (order.paymentStatus === PAYMENT_STATUS.REFUNDED) statusCounts.refundedCount += 1;

      const sellerId = order.placedByStaffId ? String(order.placedByStaffId) : "online";
      const sellerName = order.placedByName || "Storefront / Web";
      const sellerEntry = sellerMap.get(sellerId) ?? {
        sellerId,
        sellerName,
        collectedInPaise: 0,
        orderCount: 0,
      };

      if (order.paymentEntries && order.paymentEntries.length > 0) {
        for (const entry of order.paymentEntries) {
          const m = entry.paymentMethod || PAYMENT_METHOD.CASH;
          const amt = entry.amountInPaise || 0;
          totalCollectedInPaise += amt;
          sellerEntry.collectedInPaise += amt;

          const tm = tenderMap.get(m) ?? {
            method: m,
            confirmedInPaise: 0,
            pendingInPaise: 0,
            transactionCount: 0,
          };
          tm.confirmedInPaise += amt;
          tm.transactionCount += 1;
          tenderMap.set(m, tm);
        }
      } else if (order.amountPaidInPaise > 0) {
        const m = order.paymentMethod || PAYMENT_METHOD.CASH;
        const amt = order.amountPaidInPaise;
        totalCollectedInPaise += amt;
        sellerEntry.collectedInPaise += amt;

        const tm = tenderMap.get(m) ?? {
          method: m,
          confirmedInPaise: 0,
          pendingInPaise: 0,
          transactionCount: 0,
        };
        if (order.paymentStatus === PAYMENT_STATUS.PENDING_VERIFICATION) {
          tm.pendingInPaise += amt;
          pendingVerificationInPaise += amt;
        } else {
          tm.confirmedInPaise += amt;
        }
        tm.transactionCount += 1;
        tenderMap.set(m, tm);
      }

      sellerEntry.orderCount += 1;
      sellerMap.set(sellerId, sellerEntry);
    }

    const confirmedCollectionsInPaise = totalCollectedInPaise - pendingVerificationInPaise;
    const netCollectionsInPaise = confirmedCollectionsInPaise - totalRefundsInPaise;

    const duesRes = await Customer.aggregate([
      { $group: { _id: null, total: { $sum: "$outstandingDueInPaise" } } },
    ]);
    const outstandingCustomerDuesInPaise = duesRes[0]?.total ?? 0;

    return {
      range,
      totalCollectedInPaise,
      confirmedCollectionsInPaise,
      pendingVerificationInPaise,
      refundPaymentsInPaise: totalRefundsInPaise,
      netCollectionsInPaise,
      outstandingCustomerDuesInPaise,
      tenderBreakdown: Array.from(tenderMap.values()),
      orderPaymentStatusBreakdown: statusCounts,
      sellerCollections: Array.from(sellerMap.values()),
    };
  } catch (error) {
    if (isAppError(error)) throw error;
    if (!isConnectionError(error)) {
      logger.error("Failed to aggregate Offline Payment Analytics", error);
    }
    throw toDatabaseError(error);
  }
}

/* ---------------------------------------------------------------------------
 * Customer Receivables & Aging Reports (Section 8)
 * ------------------------------------------------------------------------- */

export interface AgingBucketSummary {
  currentInPaise: number;
  days1To30InPaise: number;
  days31To60InPaise: number;
  days61To90InPaise: number;
  over90DaysInPaise: number;
  totalOutstandingInPaise: number;
}

export interface CustomerReceivableRow {
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  outstandingBalanceInPaise: number;
  totalPurchasesInPaise: number;
  oldestUnpaidDate?: string | null;
  daysOverdue: number;
  agingCategory: "current" | "1-30" | "31-60" | "61-90" | ">90";
}

export async function getCustomerReceivablesAging(
  actor?: StaffView,
): Promise<{
  summary: AgingBucketSummary;
  customers: CustomerReceivableRow[];
}> {
  try {
    await connectDB();
  } catch (error) {
    throw toDatabaseError(error);
  }

  try {
    // Find all customers with outstanding due > 0
    const customersWithDue = await Customer.find({
      outstandingDueInPaise: { $gt: 0 },
    })
      .sort({ outstandingDueInPaise: -1 })
      .lean();

    const now = Date.now();
    const msInDay = 24 * 60 * 60 * 1000;

    const summary: AgingBucketSummary = {
      currentInPaise: 0,
      days1To30InPaise: 0,
      days31To60InPaise: 0,
      days61To90InPaise: 0,
      over90DaysInPaise: 0,
      totalOutstandingInPaise: 0,
    };

    const rows: CustomerReceivableRow[] = [];

    for (const cust of customersWithDue) {
      // Find oldest unpaid or partially paid order for this customer
      const oldestUnpaid = await Order.findOne({
        customerId: cust._id,
        paymentStatus: { $in: [PAYMENT_STATUS.UNPAID, PAYMENT_STATUS.PARTIALLY_PAID] },
        status: { $ne: ORDER_STATUS.CANCELLED },
      })
        .sort({ createdAt: 1 })
        .lean();

      const refDate = oldestUnpaid ? new Date(oldestUnpaid.createdAt).getTime() : new Date(cust.updatedAt).getTime();
      const daysOverdue = Math.max(0, Math.floor((now - refDate) / msInDay));

      let agingCategory: "current" | "1-30" | "31-60" | "61-90" | ">90" = "current";
      const due = cust.outstandingDueInPaise;
      summary.totalOutstandingInPaise += due;

      if (daysOverdue === 0) {
        agingCategory = "current";
        summary.currentInPaise += due;
      } else if (daysOverdue <= 30) {
        agingCategory = "1-30";
        summary.days1To30InPaise += due;
      } else if (daysOverdue <= 60) {
        agingCategory = "31-60";
        summary.days31To60InPaise += due;
      } else if (daysOverdue <= 90) {
        agingCategory = "61-90";
        summary.days61To90InPaise += due;
      } else {
        agingCategory = ">90";
        summary.over90DaysInPaise += due;
      }

      rows.push({
        customerId: String(cust._id),
        customerName: cust.name,
        customerPhone: cust.phone || "",
        customerEmail: cust.email,
        outstandingBalanceInPaise: due,
        totalPurchasesInPaise: cust.totalPurchasesInPaise ?? 0,
        oldestUnpaidDate: oldestUnpaid ? new Date(oldestUnpaid.createdAt).toISOString() : null,
        daysOverdue,
        agingCategory,
      });
    }

    return { summary, customers: rows };
  } catch (error) {
    if (isAppError(error)) throw error;
    if (!isConnectionError(error)) {
      logger.error("Failed to aggregate customer receivables aging", error);
    }
    throw toDatabaseError(error);
  }
}

/* ---------------------------------------------------------------------------
 * Inventory & Stock Analytics (Section 9)
 * ------------------------------------------------------------------------- */

export interface InventoryAnalyticsResult {
  totalActiveProducts: number;
  totalSkusCount: number;
  totalPhysicalStockQuantity: number;
  inventoryValuationInPaise: number;
  lowStockProductsCount: number;
  outOfStockProductsCount: number;
  lowStockItems: {
    id: string;
    name: string;
    sku: string;
    stock: number;
    minStockThreshold: number;
    unit: string;
    costInPaise: number;
    valuationInPaise: number;
  }[];
  movementTotals: Record<string, number>;
  slowMovingProducts: {
    id: string;
    name: string;
    sku: string;
    stock: number;
    costInPaise: number;
    daysSinceLastSale: number;
  }[];
}

export async function getInventoryAnalytics(): Promise<InventoryAnalyticsResult> {
  try {
    await connectDB();
  } catch (error) {
    throw toDatabaseError(error);
  }

  try {
    const products = await Product.find({ isActive: true }).lean();

    let totalPhysicalStockQuantity = 0;
    let inventoryValuationInPaise = 0;
    let lowStockProductsCount = 0;
    let outOfStockProductsCount = 0;

    const lowStockItems: InventoryAnalyticsResult["lowStockItems"] = [];
    const skuSet = new Set<string>();

    for (const p of products) {
      if (p.sku) skuSet.add(p.sku);

      if (!p.isService) {
        totalPhysicalStockQuantity += p.stock;
        const val = p.stock * (p.costInPaise ?? 0);
        inventoryValuationInPaise += val;

        if (p.stock === 0) {
          outOfStockProductsCount += 1;
          lowStockItems.push({
            id: String(p._id),
            name: p.name,
            sku: p.sku,
            stock: p.stock,
            minStockThreshold: p.minStockThreshold ?? 5,
            unit: p.unit || "Piece",
            costInPaise: p.costInPaise ?? 0,
            valuationInPaise: 0,
          });
        } else if (p.stock <= (p.minStockThreshold ?? 5)) {
          lowStockProductsCount += 1;
          lowStockItems.push({
            id: String(p._id),
            name: p.name,
            sku: p.sku,
            stock: p.stock,
            minStockThreshold: p.minStockThreshold ?? 5,
            unit: p.unit || "Piece",
            costInPaise: p.costInPaise ?? 0,
            valuationInPaise: val,
          });
        }
      }
    }

    // Stock Movement Totals
    const movementsAgg = await StockMovement.aggregate<{ _id: string; totalQuantity: number }>([
      {
        $group: {
          _id: "$movementType",
          totalQuantity: { $sum: { $abs: "$quantityChange" } },
        },
      },
    ]);

    const movementTotals: Record<string, number> = {};
    for (const m of movementsAgg) {
      movementTotals[m._id] = m.totalQuantity;
    }

    // Slow moving items (physical products with stock > 0 that haven't sold in last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentSoldProductIds = await Order.distinct("items.productId", {
      createdAt: { $gte: thirtyDaysAgo },
      status: { $nin: EXCLUDED_ORDER_STATUSES },
    });
    const soldSet = new Set(recentSoldProductIds.map(String));

    const slowMovingProducts: InventoryAnalyticsResult["slowMovingProducts"] = [];
    for (const p of products) {
      if (!p.isService && p.stock > 0 && !soldSet.has(String(p._id))) {
        slowMovingProducts.push({
          id: String(p._id),
          name: p.name,
          sku: p.sku,
          stock: p.stock,
          costInPaise: p.costInPaise ?? 0,
          daysSinceLastSale: 30,
        });
      }
    }

    return {
      totalActiveProducts: products.length,
      totalSkusCount: skuSet.size,
      totalPhysicalStockQuantity,
      inventoryValuationInPaise,
      lowStockProductsCount,
      outOfStockProductsCount,
      lowStockItems,
      movementTotals,
      slowMovingProducts: slowMovingProducts.slice(0, 10),
    };
  } catch (error) {
    if (isAppError(error)) throw error;
    if (!isConnectionError(error)) {
      logger.error("Failed to aggregate Inventory Analytics", error);
    }
    throw toDatabaseError(error);
  }
}

/* ---------------------------------------------------------------------------
 * Staff Performance Analytics (Section 11)
 * ------------------------------------------------------------------------- */

export interface StaffPerformanceRow {
  staffId: string;
  name: string;
  role: string;
  billsCreatedCount: number;
  totalSalesInPaise: number;
  collectedPaymentInPaise: number;
  averageBillValueInPaise: number;
  discountsGivenInPaise: number;
  cancelledBillsCount: number;
  refundsCount: number;
}

export async function getStaffPerformanceAnalytics(
  rangePreset: DateRangePreset = "this_month",
  customStart?: string,
  customEnd?: string,
  actor?: StaffView,
): Promise<{ range: ResolvedDateRange; staffList: StaffPerformanceRow[] }> {
  try {
    await connectDB();
  } catch (error) {
    throw toDatabaseError(error);
  }

  const range = resolveDateRange(rangePreset, customStart, customEnd);

  const staffQuery: Record<string, unknown> = { isActive: true };
  if (actor && isSellerRole(actor.role)) {
    staffQuery._id = new Types.ObjectId(actor.id);
  }

  try {
    const staffProfiles = await StaffProfile.find(staffQuery).lean();

    const orderAgg = await Order.aggregate<{
      _id: Types.ObjectId;
      billsCreated: number;
      totalSales: number;
      collected: number;
      discounts: number;
      cancelledCount: number;
      refundsCount: number;
    }>([
      {
        $match: {
          createdAt: { $gte: range.startUtc, $lt: range.endUtc },
        },
      },
      {
        $group: {
          _id: "$placedByStaffId",
          billsCreated: { $sum: 1 },
          totalSales: {
            $sum: {
              $cond: [
                { $in: ["$status", EXCLUDED_ORDER_STATUSES] },
                0,
                "$totalInPaise",
              ],
            },
          },
          collected: {
            $sum: {
              $cond: [
                { $eq: ["$status", ORDER_STATUS.CANCELLED] },
                0,
                "$amountPaidInPaise",
              ],
            },
          },
          discounts: {
            $sum: {
              $cond: [
                { $in: ["$status", EXCLUDED_ORDER_STATUSES] },
                0,
                "$discountInPaise",
              ],
            },
          },
          cancelledCount: {
            $sum: { $cond: [{ $eq: ["$status", ORDER_STATUS.CANCELLED] }, 1, 0] },
          },
          refundsCount: {
            $sum: { $cond: [{ $eq: ["$status", ORDER_STATUS.REFUNDED] }, 1, 0] },
          },
        },
      },
    ]);

    const statsMap = new Map(orderAgg.map((o) => [String(o._id), o]));

    const staffList: StaffPerformanceRow[] = staffProfiles.map((s) => {
      const stats = statsMap.get(String(s._id));
      const bills = stats?.billsCreated ?? 0;
      const sales = stats?.totalSales ?? 0;
      const aov = bills > 0 ? Math.round(sales / bills) : 0;

      return {
        staffId: String(s._id),
        name: s.name,
        role: s.role,
        billsCreatedCount: bills,
        totalSalesInPaise: sales,
        collectedPaymentInPaise: stats?.collected ?? 0,
        averageBillValueInPaise: aov,
        discountsGivenInPaise: stats?.discounts ?? 0,
        cancelledBillsCount: stats?.cancelledCount ?? 0,
        refundsCount: stats?.refundsCount ?? 0,
      };
    });

    return { range, staffList };
  } catch (error) {
    if (isAppError(error)) throw error;
    if (!isConnectionError(error)) {
      logger.error("Failed to aggregate Staff Performance Analytics", error);
    }
    throw toDatabaseError(error);
  }
}

/* ---------------------------------------------------------------------------
 * Customer Analytics (Section 12)
 * ------------------------------------------------------------------------- */

export interface CustomerAnalyticsResult {
  totalCustomers: number;
  newCustomersInPeriod: number;
  repeatCustomersCount: number;
  activePurchasingCount: number;
  averageCustomerSpendInPaise: number;
  topCustomers: {
    id: string;
    name: string;
    phone: string;
    email: string;
    totalPurchasesInPaise: number;
    outstandingDueInPaise: number;
    orderCount: number;
  }[];
}

export async function getCustomerAnalytics(
  rangePreset: DateRangePreset = "this_month",
  customStart?: string,
  customEnd?: string,
): Promise<CustomerAnalyticsResult> {
  try {
    await connectDB();
  } catch (error) {
    throw toDatabaseError(error);
  }

  const range = resolveDateRange(rangePreset, customStart, customEnd);

  try {
    const totalCustomers = await Customer.countDocuments();
    const newCustomersInPeriod = await Customer.countDocuments({
      createdAt: { $gte: range.startUtc, $lt: range.endUtc },
    });

    // Orders in period grouped by customer
    const custAgg = await Order.aggregate<{
      _id: Types.ObjectId;
      orderCount: number;
      totalSpend: number;
    }>([
      {
        $match: {
          createdAt: { $gte: range.startUtc, $lt: range.endUtc },
          customerId: { $ne: null },
          status: { $nin: EXCLUDED_ORDER_STATUSES },
        },
      },
      {
        $group: {
          _id: "$customerId",
          orderCount: { $sum: 1 },
          totalSpend: { $sum: "$totalInPaise" },
        },
      },
    ]);

    const activePurchasingCount = custAgg.length;
    let repeatCustomersCount = 0;
    let totalSpendInPeriod = 0;

    for (const c of custAgg) {
      if (c.orderCount > 1) repeatCustomersCount += 1;
      totalSpendInPeriod += c.totalSpend;
    }

    const aov =
      activePurchasingCount > 0 ? Math.round(totalSpendInPeriod / activePurchasingCount) : 0;

    // Top 10 lifetime customers
    const topCust = await Customer.find()
      .sort({ totalPurchasesInPaise: -1 })
      .limit(10)
      .lean();

    const topCustomers = topCust.map((c) => ({
      id: String(c._id),
      name: c.name,
      phone: c.phone || "",
      email: c.email,
      totalPurchasesInPaise: c.totalPurchasesInPaise ?? 0,
      outstandingDueInPaise: c.outstandingDueInPaise ?? 0,
      orderCount: 0,
    }));

    return {
      totalCustomers,
      newCustomersInPeriod,
      repeatCustomersCount,
      activePurchasingCount,
      averageCustomerSpendInPaise: aov,
      topCustomers,
    };
  } catch (error) {
    if (isAppError(error)) throw error;
    if (!isConnectionError(error)) {
      logger.error("Failed to aggregate Customer Analytics", error);
    }
    throw toDatabaseError(error);
  }
}

/* ---------------------------------------------------------------------------
 * Purchase & Supplier Analytics (Section 13)
 * ------------------------------------------------------------------------- */

export interface SupplierAnalyticsResult {
  totalPurchaseOrders: number;
  totalReceivedPurchases: number;
  pendingPurchaseOrders: number;
  totalOrderedValueInPaise: number;
  totalReceivedValueInPaise: number;
  totalPaidToSuppliersInPaise: number;
  remainingSupplierDuesInPaise: number;
  supplierTotals: {
    supplierId: string;
    supplierName: string;
    poCount: number;
    orderedInPaise: number;
    amountPaidInPaise: number;
    dueInPaise: number;
  }[];
}

export async function getPurchaseSupplierAnalytics(): Promise<SupplierAnalyticsResult> {
  try {
    await connectDB();
  } catch (error) {
    throw toDatabaseError(error);
  }

  try {
    const pos = await PurchaseOrder.find().lean();
    let totalPurchaseOrders = 0;
    let totalReceivedPurchases = 0;
    let pendingPurchaseOrders = 0;
    let totalOrderedValueInPaise = 0;
    let totalPaidToSuppliersInPaise = 0;

    const supplierMap = new Map<string, {
      supplierId: string;
      supplierName: string;
      poCount: number;
      orderedInPaise: number;
      amountPaidInPaise: number;
      dueInPaise: number;
    }>();

    for (const po of pos) {
      totalPurchaseOrders += 1;
      if (po.status === PURCHASE_ORDER_STATUS.RECEIVED) totalReceivedPurchases += 1;
      if (po.status === PURCHASE_ORDER_STATUS.PENDING_APPROVAL || po.status === PURCHASE_ORDER_STATUS.APPROVED) {
        pendingPurchaseOrders += 1;
      }
      totalOrderedValueInPaise += po.totalInPaise ?? 0;
      totalPaidToSuppliersInPaise += po.amountPaidInPaise ?? 0;

      const sid = String(po.supplierId);
      const sEntry = supplierMap.get(sid) ?? {
        supplierId: sid,
        supplierName: po.supplierName,
        poCount: 0,
        orderedInPaise: 0,
        amountPaidInPaise: 0,
        dueInPaise: 0,
      };
      sEntry.poCount += 1;
      sEntry.orderedInPaise += po.totalInPaise ?? 0;
      sEntry.amountPaidInPaise += po.amountPaidInPaise ?? 0;
      sEntry.dueInPaise = Math.max(0, sEntry.orderedInPaise - sEntry.amountPaidInPaise);
      supplierMap.set(sid, sEntry);
    }

    const remainingSupplierDuesInPaise = Math.max(
      0,
      totalOrderedValueInPaise - totalPaidToSuppliersInPaise,
    );

    return {
      totalPurchaseOrders,
      totalReceivedPurchases,
      pendingPurchaseOrders,
      totalOrderedValueInPaise,
      totalReceivedValueInPaise: totalOrderedValueInPaise,
      totalPaidToSuppliersInPaise,
      remainingSupplierDuesInPaise,
      supplierTotals: Array.from(supplierMap.values()),
    };
  } catch (error) {
    if (isAppError(error)) throw error;
    if (!isConnectionError(error)) {
      logger.error("Failed to aggregate Purchase & Supplier Analytics", error);
    }
    throw toDatabaseError(error);
  }
}

/* ---------------------------------------------------------------------------
 * Real-Time Business Operational Alerts (Section 18)
 * ------------------------------------------------------------------------- */

export interface BusinessAlertItem {
  id: string;
  type: "warning" | "danger" | "info";
  title: string;
  message: string;
  actionUrl: string;
  actionLabel: string;
  count?: number;
}

export async function getBusinessAlerts(actor?: StaffView): Promise<BusinessAlertItem[]> {
  try {
    await connectDB();
  } catch (error) {
    throw toDatabaseError(error);
  }

  const alerts: BusinessAlertItem[] = [];

  try {
    // 1. Low stock alerts
    const lowStockCount = await Product.countDocuments({
      isActive: true,
      isService: false,
      stock: { $gt: 0 },
      $expr: { $lte: ["$stock", "$minStockThreshold"] },
    });
    if (lowStockCount > 0) {
      alerts.push({
        id: "alert-low-stock",
        type: "warning",
        title: "Low stock alert",
        message: `${lowStockCount} product(s) are below their reorder threshold.`,
        actionUrl: "/pos/inventory",
        actionLabel: "View inventory",
        count: lowStockCount,
      });
    }

    // 2. Out of stock alerts
    const outOfStockCount = await Product.countDocuments({
      isActive: true,
      isService: false,
      stock: 0,
    });
    if (outOfStockCount > 0) {
      alerts.push({
        id: "alert-out-of-stock",
        type: "danger",
        title: "Out of stock alert",
        message: `${outOfStockCount} physical product(s) have zero stock.`,
        actionUrl: "/pos/inventory",
        actionLabel: "Restock products",
        count: outOfStockCount,
      });
    }

    // 3. Pending payment verification (cheque/bank transfer)
    const pendingVerificationCount = await Order.countDocuments({
      paymentStatus: PAYMENT_STATUS.PENDING_VERIFICATION,
    });
    if (pendingVerificationCount > 0) {
      alerts.push({
        id: "alert-pending-payments",
        type: "info",
        title: "Payments pending verification",
        message: `${pendingVerificationCount} offline order(s) require payment verification.`,
        actionUrl: "/pos/orders",
        actionLabel: "Review orders",
        count: pendingVerificationCount,
      });
    }

    // 4. Pending refund approvals
    const pendingRefundsCount = await Order.countDocuments({
      "refunds.status": REFUND_STATUS.REQUESTED,
    });
    if (pendingRefundsCount > 0) {
      alerts.push({
        id: "alert-pending-refunds",
        type: "warning",
        title: "Refund requests pending",
        message: `${pendingRefundsCount} refund request(s) require managerial approval.`,
        actionUrl: "/pos/orders",
        actionLabel: "Approve refunds",
        count: pendingRefundsCount,
      });
    }

    // 5. Overdue customer balances
    const overdueCustomerCount = await Customer.countDocuments({
      outstandingDueInPaise: { $gt: 0 },
    });
    if (overdueCustomerCount > 0) {
      alerts.push({
        id: "alert-overdue-customers",
        type: "warning",
        title: "Outstanding customer dues",
        message: `${overdueCustomerCount} customer(s) have unpaid outstanding balances.`,
        actionUrl: "/pos/customers",
        actionLabel: "View receivables",
        count: overdueCustomerCount,
      });
    }

    return alerts;
  } catch (error) {
    if (isAppError(error)) throw error;
    if (!isConnectionError(error)) {
      logger.error("Failed to generate operational alerts", error);
    }
    return alerts;
  }
}
