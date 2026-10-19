import "server-only";

import { Types } from "mongoose";

import { ORDER_CHANNEL, ORDER_STATUS } from "@/lib/constants/order";
import { connectDB } from "@/lib/db/mongodb";
import { ensureRequestTime } from "@/lib/db/request-time";
import { toDatabaseError } from "@/lib/services/service-errors";
import {
  ReportAggregationFailedError,
  isAppError,
  isConnectionError,
} from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";
import { getBusinessDays, getBusinessTimezone } from "@/lib/utils/business-time";
import { Order } from "@/models/Order";
import type { SalesChannelStats, SalesReport } from "@/types/order";

/**
 * Sales reports (Phase 5).
 *
 * Every number is aggregated straight from MongoDB Order documents - there is
 * no cached or second revenue store to go stale. Revenue excludes REFUNDED and
 * CANCELLED orders; "orders today" counts every order placed in the business
 * day regardless of final status.
 *
 * Day boundaries use the configured business timezone (BUSINESS_TIMEZONE),
 * never a browser zone or the server's local clock.
 */

type QualifyingStatuses = readonly [string, ...string[]];

/** Revenue never includes refunded or cancelled sales. */
const REVENUE_EXCLUDED_STATUSES: QualifyingStatuses = [
  ORDER_STATUS.REFUNDED,
  ORDER_STATUS.CANCELLED,
] as const;

interface FacetTotalsRow {
  revenueInPaise: number;
}

interface FacetCountRow {
  count: number;
}

interface FacetChannelRow {
  _id: { channel: string; status: string };
  count: number;
  revenueInPaise: number;
}

interface SevenDayRow {
  _id: string;
  revenueInPaise: number;
}

interface SalesReportFacet {
  todayRevenue: FacetTotalsRow[];
  ordersToday: FacetCountRow[];
  totals: (FacetTotalsRow & { count: number })[];
  channels: FacetChannelRow[];
}

function emptyChannelStats(): SalesChannelStats {
  return { orderCount: 0, revenueInPaise: 0 };
}

export async function getSalesReport(staffId?: string): Promise<SalesReport> {
  await ensureRequestTime();

  try {
    await connectDB();
  } catch (error) {
    throw toDatabaseError(error);
  }

  const staffMatch =
    staffId && Types.ObjectId.isValid(staffId)
      ? { placedByStaffId: new Types.ObjectId(staffId) }
      : {};

  const timezone = getBusinessTimezone();
  // days[0] = oldest, days[6] = today.
  const days = getBusinessDays(7);
  const today = days[days.length - 1];

  try {
    const [facet] = await Order.aggregate<SalesReportFacet>([
      {
        $facet: {
          todayRevenue: [
            {
              $match: {
                createdAt: { $gte: today.startUtc, $lt: today.endUtc },
                status: { $nin: REVENUE_EXCLUDED_STATUSES },
                ...staffMatch,
              },
            },
            {
              $group: {
                _id: null,
                revenueInPaise: { $sum: "$totalInPaise" },
              },
            },
          ],
          ordersToday: [
            {
              $match: {
                createdAt: { $gte: today.startUtc, $lt: today.endUtc },
                ...staffMatch,
              },
            },
            { $count: "count" },
          ],
          totals: [
            {
              $match: {
                status: { $nin: REVENUE_EXCLUDED_STATUSES },
                ...staffMatch,
              },
            },
            {
              $group: {
                _id: null,
                revenueInPaise: { $sum: "$totalInPaise" },
                count: { $sum: 1 },
              },
            },
          ],
          channels: [
            ...(Object.keys(staffMatch).length > 0 ? [{ $match: staffMatch }] : []),
            {
              $group: {
                _id: { channel: "$channel", status: "$status" },
                count: { $sum: 1 },
                revenueInPaise: { $sum: "$totalInPaise" },
              },
            },
          ],
        },
      },
    ]);

    const sevenDay = await Order.aggregate<SevenDayRow>([
      {
        $match: {
          createdAt: { $gte: days[0].startUtc, $lt: today.endUtc },
          status: { $nin: REVENUE_EXCLUDED_STATUSES },
          ...staffMatch,
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone },
          },
          revenueInPaise: { $sum: "$totalInPaise" },
        },
      },
    ]);

    const todayRevenueInPaise = facet?.todayRevenue[0]?.revenueInPaise ?? 0;
    const ordersToday = facet?.ordersToday[0]?.count ?? 0;
    const totalRevenueInPaise = facet?.totals[0]?.revenueInPaise ?? 0;
    const totalOrderCount = facet?.totals[0]?.count ?? 0;
    const averageOrderValueInPaise =
      totalOrderCount > 0 ? Math.floor(totalRevenueInPaise / totalOrderCount) : 0;

    const revenueByDay = new Map<string, number>(
      (sevenDay ?? []).map((row) => [row._id, row.revenueInPaise]),
    );
    const last7Days = days.map((day) => ({
      date: day.dateKey,
      label: day.label,
      revenueInPaise: revenueByDay.get(day.dateKey) ?? 0,
    }));

    const inStore = emptyChannelStats();
    const online = emptyChannelStats();
    let refundedCount = 0;

    for (const row of facet?.channels ?? []) {
      if (row._id.status === ORDER_STATUS.CANCELLED) continue;

      if (row._id.status === ORDER_STATUS.REFUNDED) {
        refundedCount += row.count;
        continue;
      }

      const bucket =
        row._id.channel === ORDER_CHANNEL.IN_STORE ? inStore : online;
      bucket.orderCount += row.count;
      bucket.revenueInPaise += row.revenueInPaise;
    }

    return {
      generatedAt: new Date().toISOString(),
      timezone,
      todayRevenueInPaise,
      ordersToday,
      totalRevenueInPaise,
      totalOrderCount,
      averageOrderValueInPaise,
      last7Days,
      channelBreakdown: {
        inStore,
        online,
        refundedCount,
      },
    };
  } catch (error) {
    if (isAppError(error)) throw error;
    if (!isConnectionError(error)) {
      logger.error("Sales report aggregation failed", error);
      throw new ReportAggregationFailedError(undefined, error);
    }
    throw toDatabaseError(error);
  }
}