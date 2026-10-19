"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { getJson } from "@/components/pos/api";
import { getNavItems } from "@/components/pos/nav-items";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { RefreshIcon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/Spinner";
import {
  STAFF_ROLE_LABELS,
  isSellerRole,
} from "@/lib/constants/staff";
import type { AdminOverviewKpiResult, BusinessAlertItem, DateRangePreset } from "@/lib/services/analytics.service";
import { formatMoney } from "@/lib/utils/money";
import type { StaffView } from "@/types/staff";

interface OverviewApiResponse {
  overview: AdminOverviewKpiResult;
  alerts: BusinessAlertItem[];
}

const PRESET_OPTIONS: { value: DateRangePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This Week" },
  { value: "last_7_days", label: "Last 7 Days" },
  { value: "this_month", label: "This Month" },
  { value: "last_30_days", label: "Last 30 Days" },
  { value: "this_quarter", label: "This Quarter" },
  { value: "this_year", label: "This Year" },
];

/** Portal landing page: overview of who you are, business intelligence KPIs, and quick links. */
export function DashboardView({ staff }: { staff: StaffView }) {
  const navItems = getNavItems(staff).filter((item) => item.href !== "/pos");

  const [preset, setPreset] = useState<DateRangePreset>("this_month");
  const [data, setData] = useState<OverviewApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      const res = await getJson<OverviewApiResponse>(
        `/api/pos/analytics/overview?preset=${preset}`,
      );
      if (cancelled) return;
      setLoading(false);
      if (res.ok) {
        setData(res.data);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [preset, reloadKey]);

  const overview = data?.overview;
  const alerts = data?.alerts ?? [];

  return (
    <div className="space-y-8">
      {/* Header section */}
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">
            Operations workspace
          </p>
          <h1 className="page-title mt-1 text-3xl font-bold text-slate-950">
            Welcome back, {staff.name}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone="info">{STAFF_ROLE_LABELS[staff.role]}</Badge>
          </div>
        </div>

        {/* Date Filter & Refresh */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={preset}
            onChange={(e) => setPreset(e.target.value as DateRangePreset)}
            aria-label="Filter date range"
            className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none"
          >
            {PRESET_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setReloadKey((k) => k + 1)}
            aria-label="Refresh metrics"
          >
            <RefreshIcon className="h-4 w-4" /> Refresh
          </Button>
        </div>
      </section>

      {/* Operational Alerts */}
      {alerts.length > 0 && (
        <section aria-labelledby="alerts-heading" className="space-y-2">
          <h2 id="alerts-heading" className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Operational Alerts
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={`flex items-center justify-between rounded-xl border p-3.5 text-xs shadow-sm ${
                  alert.type === "danger"
                    ? "border-rose-200 bg-rose-50 text-rose-900"
                    : alert.type === "warning"
                      ? "border-amber-200 bg-amber-50 text-amber-900"
                      : "border-indigo-200 bg-indigo-50 text-indigo-900"
                }`}
              >
                <div>
                  <p className="font-bold">{alert.title}</p>
                  <p className="mt-0.5 opacity-90">{alert.message}</p>
                </div>
                <Link
                  href={alert.actionUrl}
                  className="ml-3 shrink-0 rounded-lg bg-white/80 px-2.5 py-1 font-semibold underline shadow-sm hover:bg-white"
                >
                  {alert.actionLabel}
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Complete Business Overview: 20 Verified Real-time KPI Cards */}
      <section aria-labelledby="business-kpis">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="business-kpis" className="text-lg font-bold text-slate-900">
            Business Overview {overview?.range.label ? `— ${overview.range.label}` : ""}
          </h2>
          {loading && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Spinner /> Updating...
            </div>
          )}
        </div>

        {overview ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {/* 1. Total Sales */}
            <Link
              href="/pos/orders"
              className="rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-indigo-300 hover:shadow-md"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                1. Total Sales
              </p>
              <p className="mt-2 text-lg font-bold tabular-nums text-slate-900 sm:text-xl">
                {formatMoney(overview.totalSalesInPaise)}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">All non-cancelled orders</p>
            </Link>

            {/* 2. Gross Sales */}
            <Link
              href="/pos/reports"
              className="rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-indigo-300 hover:shadow-md"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                2. Gross Sales
              </p>
              <p className="mt-2 text-lg font-bold tabular-nums text-slate-900 sm:text-xl">
                {formatMoney(overview.grossSalesInPaise)}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">Subtotal before discount</p>
            </Link>

            {/* 3. Net Sales */}
            <Link
              href="/pos/reports"
              className="rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-indigo-300 hover:shadow-md"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                3. Net Sales
              </p>
              <p className="mt-2 text-lg font-bold tabular-nums text-slate-900 sm:text-xl">
                {formatMoney(overview.netSalesInPaise)}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                {overview.growth.salesGrowthPercent !== null
                  ? `${overview.growth.salesGrowthPercent >= 0 ? "+" : ""}${overview.growth.salesGrowthPercent}% ${overview.range.comparisonLabel}`
                  : "Gross - Disc - Refunds"}
              </p>
            </Link>

            {/* 4. Collected Payments */}
            <Link
              href="/pos/reports"
              className="rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-indigo-300 hover:shadow-md"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                4. Collected Payments
              </p>
              <p className="mt-2 text-lg font-bold tabular-nums text-slate-900 sm:text-xl">
                {formatMoney(overview.collectedPaymentsInPaise)}
              </p>
              <p className="mt-1 text-[11px] text-emerald-600 font-medium">Verified offline tender</p>
            </Link>

            {/* 5. Outstanding Dues */}
            <Link
              href="/pos/customers"
              className="rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-indigo-300 hover:shadow-md"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                5. Customer Dues
              </p>
              <p className="mt-2 text-lg font-bold tabular-nums text-amber-600 sm:text-xl">
                {formatMoney(overview.outstandingCustomerDuesInPaise)}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">Uncollected balances</p>
            </Link>

            {/* 6. Total Orders */}
            <Link
              href="/pos/orders"
              className="rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-indigo-300 hover:shadow-md"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                6. Total Orders
              </p>
              <p className="mt-2 text-lg font-bold tabular-nums text-slate-900 sm:text-xl">
                {overview.totalOrdersCount.toLocaleString("en-IN")}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">All placed in period</p>
            </Link>

            {/* 7. Completed Orders */}
            <Link
              href="/pos/orders"
              className="rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-indigo-300 hover:shadow-md"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                7. Completed Orders
              </p>
              <p className="mt-2 text-lg font-bold tabular-nums text-slate-900 sm:text-xl">
                {overview.completedOrdersCount.toLocaleString("en-IN")}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">Delivered & completed</p>
            </Link>

            {/* 8. Cancelled Orders */}
            <Link
              href="/pos/orders"
              className="rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-indigo-300 hover:shadow-md"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                8. Cancelled Orders
              </p>
              <p className="mt-2 text-lg font-bold tabular-nums text-rose-600 sm:text-xl">
                {overview.cancelledOrdersCount.toLocaleString("en-IN")}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">Reversed orders</p>
            </Link>

            {/* 9. Total Refunds */}
            <Link
              href="/pos/orders"
              className="rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-indigo-300 hover:shadow-md"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                9. Total Refunds
              </p>
              <p className="mt-2 text-lg font-bold tabular-nums text-slate-900 sm:text-xl">
                {formatMoney(overview.totalRefundsInPaise)}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                {overview.refundedOrdersCount} order(s) refunded
              </p>
            </Link>

            {/* 10. Gross Profit */}
            <Link
              href="/pos/reports"
              className="rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-indigo-300 hover:shadow-md"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                10. Gross Profit
              </p>
              <p className="mt-2 text-lg font-bold tabular-nums text-slate-900 sm:text-xl">
                {formatMoney(overview.grossProfitInPaise)}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">Net Sales - COGS</p>
            </Link>

            {/* 11. Gross Profit Margin */}
            <Link
              href="/pos/reports"
              className="rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-indigo-300 hover:shadow-md"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                11. Gross Margin
              </p>
              <p className="mt-2 text-lg font-bold tabular-nums text-slate-900 sm:text-xl">
                {overview.grossProfitMarginPercent}%
              </p>
              <p className="mt-1 text-[11px] text-slate-500">Gross Profit / Net Sales</p>
            </Link>

            {/* 12. Net Profit */}
            <Link
              href="/pos/reports"
              className="rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-indigo-300 hover:shadow-md"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                12. Net Profit
              </p>
              <p className="mt-2 text-lg font-bold tabular-nums text-slate-900 sm:text-xl">
                {overview.isNetProfitAvailable && overview.netProfitInPaise !== null
                  ? formatMoney(overview.netProfitInPaise)
                  : "Not available"}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                {overview.isNetProfitAvailable
                  ? `Less ${formatMoney(overview.operatingExpensesInPaise)} exp`
                  : "Requires expense entries"}
              </p>
            </Link>

            {/* 13. Total Products */}
            <Link
              href="/pos/inventory"
              className="rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-indigo-300 hover:shadow-md"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                13. Total Products
              </p>
              <p className="mt-2 text-lg font-bold tabular-nums text-slate-900 sm:text-xl">
                {overview.totalProductsCount.toLocaleString("en-IN")}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">Active catalog items</p>
            </Link>

            {/* 14. Low Stock Products */}
            <Link
              href="/pos/inventory"
              className="rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-indigo-300 hover:shadow-md"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                14. Low Stock
              </p>
              <p className={`mt-2 text-lg font-bold tabular-nums sm:text-xl ${overview.lowStockProductsCount > 0 ? "text-amber-600" : "text-slate-900"}`}>
                {overview.lowStockProductsCount.toLocaleString("en-IN")}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">Below min threshold</p>
            </Link>

            {/* 15. Out-of-Stock Products */}
            <Link
              href="/pos/inventory"
              className="rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-indigo-300 hover:shadow-md"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                15. Out-of-Stock
              </p>
              <p className={`mt-2 text-lg font-bold tabular-nums sm:text-xl ${overview.outOfStockProductsCount > 0 ? "text-rose-600" : "text-slate-900"}`}>
                {overview.outOfStockProductsCount.toLocaleString("en-IN")}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">Zero inventory</p>
            </Link>

            {/* 16. Inventory Valuation */}
            <Link
              href="/pos/inventory"
              className="rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-indigo-300 hover:shadow-md"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                16. Stock Valuation
              </p>
              <p className="mt-2 text-lg font-bold tabular-nums text-slate-900 sm:text-xl">
                {formatMoney(overview.inventoryValuationInPaise)}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">Stock × Unit Cost</p>
            </Link>

            {/* 17. Active Customers */}
            <Link
              href="/pos/customers"
              className="rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-indigo-300 hover:shadow-md"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                17. Active Customers
              </p>
              <p className="mt-2 text-lg font-bold tabular-nums text-slate-900 sm:text-xl">
                {overview.activeCustomersCount.toLocaleString("en-IN")}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">Registered profiles</p>
            </Link>

            {/* 18. Active Sellers */}
            <Link
              href="/pos/team"
              className="rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-indigo-300 hover:shadow-md"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                18. Active Sellers
              </p>
              <p className="mt-2 text-lg font-bold tabular-nums text-slate-900 sm:text-xl">
                {overview.activeSellersCount.toLocaleString("en-IN")}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">Register cashiers</p>
            </Link>

            {/* 19. Active Managers */}
            <Link
              href="/pos/team"
              className="rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-indigo-300 hover:shadow-md"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                19. Active Managers
              </p>
              <p className="mt-2 text-lg font-bold tabular-nums text-slate-900 sm:text-xl">
                {overview.activeManagersCount.toLocaleString("en-IN")}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">Store operations</p>
            </Link>

            {/* 20. Pending Approvals */}
            <Link
              href="/pos/orders"
              className="rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-indigo-300 hover:shadow-xs"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                20. Pending Approvals
              </p>
              <p className={`mt-2 text-lg font-bold tabular-nums sm:text-xl ${overview.pendingApprovalsCount > 0 ? "text-amber-600" : "text-slate-900"}`}>
                {overview.pendingApprovalsCount.toLocaleString("en-IN")}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">Refunds, POs & payments</p>
            </Link>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 py-12 text-sm text-slate-500">
            <Spinner /> Loading overview metrics...
          </div>
        )}
      </section>

      {/* Quick links */}
      <section aria-labelledby="quick-links">
        <h2 id="quick-links" className="text-lg font-bold text-slate-900">
          Quick links
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-lg"
            >
              <p className="font-semibold text-slate-900 transition-colors group-hover:text-indigo-700">
                {item.label}
              </p>
              <p className="mt-1 text-sm text-slate-600">{item.description}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* About this portal */}
      <section aria-labelledby="portal-info" className="max-w-2xl">
        <h2 id="portal-info" className="text-lg font-bold text-slate-900">
          About this portal
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Your workspace is tailored to your role. Sellers can run the register and
          support customers, while managers and administrators can also control inventory,
          fulfilment, reports, customer access and the staff team.
        </p>
        {isSellerRole(staff.role) ? null : (
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            You can add teammates from{" "}
            <Link href="/pos/team" className="font-semibold text-slate-900 underline">
              Team access
            </Link>
            .
          </p>
        )}
      </section>
    </div>
  );
}
