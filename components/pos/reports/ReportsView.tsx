"use client";

import { useEffect, useState } from "react";

import { getJson } from "@/components/pos/api";
import { RevenueChart } from "@/components/pos/reports/RevenueChart";
import { Button } from "@/components/ui/Button";
import { RefreshIcon } from "@/components/ui/icons";
import { Price } from "@/components/ui/Price";
import { Spinner } from "@/components/ui/Spinner";
import { ErrorState } from "@/components/common/ErrorState";
import { formatDateTime } from "@/lib/utils/format";
import { formatMoney } from "@/lib/utils/money";
import type { SalesReport } from "@/types/order";

/**
 * Sales reports (Phase 5). Every number is aggregated live from MongoDB Order
 * documents - today's revenue, orders today, all-time revenue, average order
 * value, a 7-day revenue chart (zero-sale days included) and the online vs
 * in-store split plus refunded orders.
 */
export function ReportsView() {
  const [report, setReport] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError(null);
      const result = await getJson<{ report: SalesReport }>("/api/pos/reports");
      if (cancelled) return;
      setLoading(false);
      if (result.ok) {
        setReport(result.data.report);
      } else {
        setError(result.message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 py-16 text-sm text-slate-500">
        <Spinner /> Loading reports...
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState
        title="Could not load reports"
        description={error}
        action={
          <Button variant="secondary" size="sm" onClick={() => setReloadKey((key) => key + 1)}>
            <RefreshIcon className="h-4 w-4" /> Try again
          </Button>
        }
      />
    );
  }

  if (!report) return null;

  const cards = [
    { label: "Today's revenue", value: formatMoney(report.todayRevenueInPaise) },
    { label: "Orders today", value: report.ordersToday.toLocaleString("en-IN") },
    { label: "Total revenue", value: formatMoney(report.totalRevenueInPaise) },
    {
      label: "Average order value",
      value: formatMoney(report.averageOrderValueInPaise),
    },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Reports</h1>
          <p className="mt-1 text-sm text-slate-600">
            Generated {formatDateTime(report.generatedAt)} · business timezone{" "}
            {report.timezone}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setReloadKey((key) => key + 1)}>
          <RefreshIcon className="h-4 w-4" /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {card.label}
            </p>
            <p className="mt-2 text-xl font-bold tabular-nums text-slate-900 sm:text-2xl">
              {card.value}
            </p>
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">
          Revenue – last 7 days
        </h2>
        <RevenueChart days={report.last7Days} />
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          {
            label: "In-store",
            count: report.channelBreakdown.inStore.orderCount,
            revenue: report.channelBreakdown.inStore.revenueInPaise,
          },
          {
            label: "Online",
            count: report.channelBreakdown.online.orderCount,
            revenue: report.channelBreakdown.online.revenueInPaise,
          },
          {
            label: "Refunded orders",
            count: report.channelBreakdown.refundedCount,
            revenue: null,
          },
        ].map((bucket) => (
          <div key={bucket.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {bucket.label}
            </p>
            <p className="mt-2 text-lg font-bold tabular-nums text-slate-900">
              {bucket.count.toLocaleString("en-IN")}
              <span className="ml-1 text-sm font-medium text-slate-500">orders</span>
            </p>
            {bucket.revenue !== null ? (
              <Price amountInPaise={bucket.revenue} className="mt-1 block text-sm text-slate-600" />
            ) : (
              <p className="mt-1 text-sm text-slate-600">
                {bucket.count === 0 ? "No refunds yet" : "Refunded orders are excluded from revenue"}
              </p>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}