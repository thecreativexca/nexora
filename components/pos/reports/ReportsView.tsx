"use client";

import { useEffect, useState } from "react";

import { getJson } from "@/components/pos/api";
import { AddExpenseDialog } from "@/components/pos/reports/AddExpenseDialog";
import { DailyClosingDialog } from "@/components/pos/reports/DailyClosingDialog";
import { RevenueChart } from "@/components/pos/reports/RevenueChart";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { RefreshIcon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/Spinner";
import { ErrorState } from "@/components/common/ErrorState";
import type {
  AgingBucketSummary,
  CustomerReceivableRow,
  DateRangePreset,
  FinancialAnalyticsResult,
  InventoryAnalyticsResult,
  OfflinePaymentAnalyticsResult,
  SalesAnalyticsResult,
  StaffPerformanceRow,
} from "@/lib/services/analytics.service";
import type { DailyClosingDocument } from "@/models/DailyClosing";
import type { ExpenseDocument } from "@/models/Expense";
import { formatMoney } from "@/lib/utils/money";

type ReportTab =
  | "sales"
  | "financial"
  | "payments"
  | "receivables"
  | "inventory"
  | "staff"
  | "expenses"
  | "closing";

const TAB_OPTIONS: { id: ReportTab; label: string }[] = [
  { id: "sales", label: "Sales & Revenue" },
  { id: "financial", label: "Profit & Loss" },
  { id: "payments", label: "Offline Payments" },
  { id: "receivables", label: "Customer Receivables" },
  { id: "inventory", label: "Inventory Valuation" },
  { id: "staff", label: "Staff Performance" },
  { id: "expenses", label: "Operating Expenses" },
  { id: "closing", label: "Daily Cash Closing" },
];

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

export function ReportsView({ ownSalesOnly, canExport }: { ownSalesOnly: boolean; canExport: boolean }) {
  const [activeTab, setActiveTab] = useState<ReportTab>("sales");
  const [preset, setPreset] = useState<DateRangePreset>("this_month");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Data states
  const [salesData, setSalesData] = useState<SalesAnalyticsResult | null>(null);
  const [financialData, setFinancialData] = useState<FinancialAnalyticsResult | null>(null);
  const [paymentData, setPaymentData] = useState<OfflinePaymentAnalyticsResult | null>(null);
  const [receivablesData, setReceivablesData] = useState<{
    summary: AgingBucketSummary;
    customers: CustomerReceivableRow[];
  } | null>(null);
  const [inventoryData, setInventoryData] = useState<InventoryAnalyticsResult | null>(null);
  const [staffData, setStaffData] = useState<StaffPerformanceRow[]>([]);
  const [expensesData, setExpensesData] = useState<ExpenseDocument[]>([]);
  const [closingData, setClosingData] = useState<DailyClosingDocument[]>([]);

  // Dialog states
  const [showExpenseDialog, setShowExpenseDialog] = useState(false);
  const [showClosingDialog, setShowClosingDialog] = useState(false);

  const rangeQuery = `preset=${preset}${preset === "custom" ? `&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}` : ""}`;

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError(null);

      try {
        if (activeTab === "sales") {
          const res = await getJson<{ sales: SalesAnalyticsResult }>(
            `/api/pos/analytics/sales?${rangeQuery}`,
          );
          if (cancelled) return;
          if (res.ok) setSalesData(res.data.sales);
          else setError(res.message);
        } else if (activeTab === "financial") {
          const res = await getJson<{ financial: FinancialAnalyticsResult }>(
            `/api/pos/analytics/financial?${rangeQuery}`,
          );
          if (cancelled) return;
          if (res.ok) setFinancialData(res.data.financial);
          else setError(res.message);
        } else if (activeTab === "payments") {
          const res = await getJson<{ payments: OfflinePaymentAnalyticsResult }>(
            `/api/pos/analytics/payments?${rangeQuery}`,
          );
          if (cancelled) return;
          if (res.ok) setPaymentData(res.data.payments);
          else setError(res.message);
        } else if (activeTab === "receivables") {
          const res = await getJson<{ summary: AgingBucketSummary; customers: CustomerReceivableRow[] }>(
            "/api/pos/analytics/receivables",
          );
          if (cancelled) return;
          if (res.ok) setReceivablesData(res.data);
          else setError(res.message);
        } else if (activeTab === "inventory") {
          const res = await getJson<{ inventory: InventoryAnalyticsResult }>(
            "/api/pos/analytics/inventory",
          );
          if (cancelled) return;
          if (res.ok) setInventoryData(res.data.inventory);
          else setError(res.message);
        } else if (activeTab === "staff") {
          const res = await getJson<{ staffList: StaffPerformanceRow[] }>(
            `/api/pos/analytics/staff?${rangeQuery}`,
          );
          if (cancelled) return;
          if (res.ok) setStaffData(res.data.staffList);
          else setError(res.message);
        } else if (activeTab === "expenses") {
          const res = await getJson<{ expenses: ExpenseDocument[] }>(
            "/api/pos/expenses?pageSize=100",
          );
          if (cancelled) return;
          if (res.ok) setExpensesData(res.data.expenses);
          else setError(res.message);
        } else if (activeTab === "closing") {
          const res = await getJson<{ pastClosings: DailyClosingDocument[] }>(
            "/api/pos/daily-closing",
          );
          if (cancelled) return;
          if (res.ok) setClosingData(res.data.pastClosings);
          else setError(res.message);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load report data");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeTab, preset, startDate, endDate, rangeQuery, reloadKey]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      {/* Header with Title, Period Filter & Export Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Business Intelligence &amp; Reports
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Real-time verified analytics aggregated server-side from MongoDB records.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {activeTab !== "receivables" && activeTab !== "inventory" && activeTab !== "expenses" && activeTab !== "closing" && (
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value as DateRangePreset)}
              aria-label="Filter report date range"
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none"
            >
              {PRESET_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
              <option value="custom">Custom range</option>
            </select>
          )}

          {preset === "custom" ? (
            <div className="flex flex-wrap gap-2">
              <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} aria-label="Report start date" className="h-9 rounded-xl border border-slate-300 bg-white px-2 text-xs" />
              <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} aria-label="Report end date" className="h-9 rounded-xl border border-slate-300 bg-white px-2 text-xs" />
            </div>
          ) : null}

          {/* Export Buttons */}
          {canExport ? <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            <a
              href={`/api/pos/reports/export?reportType=${activeTab}&format=csv&${rangeQuery}`}
              download
              className="rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              title="Download RFC-4180 CSV with UTF-8 BOM"
            >
              CSV
            </a>
            <span className="text-slate-300">|</span>
            <a
              href={`/api/pos/reports/export?reportType=${activeTab}&format=excel&${rangeQuery}`}
              download
              className="rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              title="Download Excel Spreadsheet XML"
            >
              Excel
            </a>
            <span className="text-slate-300">|</span>
            <a
              href={`/api/pos/reports/export?reportType=${activeTab}&format=pdf&${rangeQuery}`}
              download
              className="rounded-lg px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
              title="Printable Report / Save as PDF"
            >
              PDF
            </a>
          </div> : null}

          <Button variant="secondary" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
            <RefreshIcon className="h-4 w-4" /> Refresh
          </Button>
        </div>
      </div>

      {/* Report Module Navigation Tabs */}
      <div className="flex overflow-x-auto border-b border-slate-200 gap-1 pb-px scrollbar-none">
        {TAB_OPTIONS.filter((tab) => !ownSalesOnly || tab.id === "sales").map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 rounded-t-xl px-4 py-2.5 text-xs font-bold transition-all border-b-2 ${
                active
                  ? "border-indigo-600 bg-indigo-50/50 text-indigo-700"
                  : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Loading & Error States */}
      {loading && (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 py-16 text-sm text-slate-500">
          <Spinner /> Loading analytics data...
        </div>
      )}

      {error && !loading && (
        <ErrorState
          title="Could not load reports"
          description={error}
          action={
            <Button variant="secondary" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
              <RefreshIcon className="h-4 w-4" /> Try again
            </Button>
          }
        />
      )}

      {/* TAB 1: Sales & Revenue Overview */}
      {!loading && !error && activeTab === "sales" && salesData && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Gross Sales
              </p>
              <p className="mt-2 text-xl font-bold tabular-nums text-slate-900 sm:text-2xl">
                {formatMoney(salesData.grossSalesInPaise)}
              </p>
              <p className="mt-1 text-xs text-slate-500">Total catalogue billing</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Net Sales
              </p>
              <p className="mt-2 text-xl font-bold tabular-nums text-slate-900 sm:text-2xl">
                {formatMoney(salesData.netSalesInPaise)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {salesData.salesGrowthPercent !== null
                  ? `${salesData.salesGrowthPercent >= 0 ? "+" : ""}${salesData.salesGrowthPercent}% growth`
                  : "After discounts & returns"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Total Orders
              </p>
              <p className="mt-2 text-xl font-bold tabular-nums text-slate-900 sm:text-2xl">
                {salesData.orderCount.toLocaleString("en-IN")}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Refund rate: {salesData.refundRatePercent}%
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Average Order Value
              </p>
              <p className="mt-2 text-xl font-bold tabular-nums text-slate-900 sm:text-2xl">
                {formatMoney(salesData.averageOrderValueInPaise)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {salesData.itemsSoldCount.toLocaleString("en-IN")} items sold
              </p>
            </div>
          </div>

          {/* Revenue Chart */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">
              Sales Trend — {salesData.range.label}
            </h2>
            <RevenueChart
              days={salesData.trends.map((t) => ({
                date: t.dateKey,
                label: t.label,
                revenueInPaise: t.netSalesInPaise,
              }))}
            />
          </section>

          {/* Category Contribution & Top Selling Products */}
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">
                Category Contribution
              </h2>
              {salesData.categoryBreakdown.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-500">No category sales in this period.</p>
              ) : (
                <div className="space-y-3">
                  {salesData.categoryBreakdown.map((cat) => (
                    <div key={cat.categoryId} className="text-xs">
                      <div className="flex justify-between font-medium">
                        <span className="text-slate-900">{cat.categoryName}</span>
                        <span className="text-slate-600 tabular-nums">
                          {formatMoney(cat.revenueInPaise)} ({cat.percentage}%)
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full bg-indigo-600 rounded-full"
                          style={{ width: `${Math.min(cat.percentage, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">
                Top Products by Revenue
              </h2>
              {salesData.topProducts.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-500">No products sold in this period.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="pb-2 font-medium">Product</th>
                        <th className="pb-2 font-medium text-right">Sold</th>
                        <th className="pb-2 font-medium text-right">Revenue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {salesData.topProducts.map((p) => (
                        <tr key={p.productId}>
                          <td className="py-2">
                            <p className="font-semibold text-slate-900 truncate max-w-[180px]">{p.productName}</p>
                            <p className="text-[10px] text-slate-400">{p.sku}</p>
                          </td>
                          <td className="py-2 text-right tabular-nums text-slate-600">
                            {p.quantitySold}
                          </td>
                          <td className="py-2 text-right font-semibold tabular-nums text-slate-900">
                            {formatMoney(p.revenueInPaise)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {/* TAB 2: Financial & Profit / Loss Statement */}
      {!loading && !error && activeTab === "financial" && financialData && (
        <div className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-4 text-base font-bold text-slate-900">
              Profit &amp; Loss Statement ({financialData.range.label})
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4">Line Item / Account</th>
                    <th className="py-3 px-4 text-right">Amount (₹)</th>
                    <th className="py-3 px-4">Accounting Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <tr>
                    <td className="py-3 px-4 font-semibold text-slate-900">Gross Sales Revenue</td>
                    <td className="py-3 px-4 text-right font-bold tabular-nums text-slate-900">
                      {formatMoney(financialData.grossSalesInPaise)}
                    </td>
                    <td className="py-3 px-4 text-slate-500">Gross catalogue sales before discounts</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-4 text-slate-600 pl-8">Less: Customer Discounts</td>
                    <td className="py-2 px-4 text-right tabular-nums text-rose-600">
                      -{formatMoney(financialData.discountsInPaise)}
                    </td>
                    <td className="py-2 px-4 text-slate-500">Register &amp; coupon deductions</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-4 text-slate-600 pl-8">Less: Sales Returns &amp; Refunds</td>
                    <td className="py-2 px-4 text-right tabular-nums text-rose-600">
                      -{formatMoney(financialData.salesReturnsInPaise)}
                    </td>
                    <td className="py-2 px-4 text-slate-500">Approved refunds recorded in period</td>
                  </tr>
                  <tr className="bg-slate-50/70 font-semibold">
                    <td className="py-3 px-4 text-slate-900">Net Sales Revenue</td>
                    <td className="py-3 px-4 text-right font-bold tabular-nums text-slate-900">
                      {formatMoney(financialData.netSalesInPaise)}
                    </td>
                    <td className="py-3 px-4 text-slate-500">Gross Sales - Discounts - Refunds</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-4 text-slate-600 pl-8">Less: Cost of Goods Sold (COGS)</td>
                    <td className="py-2 px-4 text-right tabular-nums text-rose-600">
                      -{formatMoney(financialData.costOfGoodsSoldInPaise)}
                    </td>
                    <td className="py-2 px-4 text-slate-500">Acquisition cost of sold inventory</td>
                  </tr>
                  <tr className="bg-indigo-50/50 font-bold">
                    <td className="py-3 px-4 text-indigo-950">Gross Profit</td>
                    <td className="py-3 px-4 text-right tabular-nums text-indigo-950 text-sm">
                      {formatMoney(financialData.grossProfitInPaise)}
                    </td>
                    <td className="py-3 px-4 text-indigo-800">
                      Margin: {financialData.grossProfitMarginPercent}%
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 px-4 text-slate-600 pl-8">Less: Operating Expenses</td>
                    <td className="py-2 px-4 text-right tabular-nums text-rose-600">
                      -{formatMoney(financialData.operatingExpensesInPaise)}
                    </td>
                    <td className="py-2 px-4 text-slate-500">
                      {financialData.isExpenseDataComplete
                        ? "Verified business operating expenses"
                        : "Operating expense records incomplete"}
                    </td>
                  </tr>
                  <tr className="border-t-2 border-slate-900 bg-slate-100 font-bold">
                    <td className="py-3.5 px-4 text-sm text-slate-950">Net Operating Profit</td>
                    <td className="py-3.5 px-4 text-right text-sm tabular-nums text-slate-950">
                      {financialData.netProfitInPaise !== null
                        ? formatMoney(financialData.netProfitInPaise)
                        : "Not available"}
                    </td>
                    <td className="py-3.5 px-4 text-slate-700">
                      {financialData.netProfitMarginPercent !== null
                        ? `Net Margin: ${financialData.netProfitMarginPercent}%`
                        : "Requires verified operating expense entries"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4 border-t border-slate-200 pt-5 sm:grid-cols-4">
              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase">Tax Collected</p>
                <p className="mt-1 text-sm font-bold text-slate-900">{formatMoney(financialData.taxCollectedInPaise)}</p>
                <p className="text-[10px] text-slate-400">Held on behalf of authorities</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase">Net Collections</p>
                <p className="mt-1 text-sm font-bold text-emerald-700">{formatMoney(financialData.netCollectionsInPaise)}</p>
                <p className="text-[10px] text-slate-400">Payments less refunds</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase">Receivables</p>
                <p className="mt-1 text-sm font-bold text-amber-600">{formatMoney(financialData.outstandingReceivablesInPaise)}</p>
                <p className="text-[10px] text-slate-400">Customer dues</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase">Supplier Payables</p>
                <p className="mt-1 text-sm font-bold text-slate-900">{formatMoney(financialData.supplierPayablesInPaise)}</p>
                <p className="text-[10px] text-slate-400">Pending PO payments</p>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* TAB 3: Offline Payments & Collections */}
      {!loading && !error && activeTab === "payments" && paymentData && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-base font-bold text-slate-900">
              Offline Tender Breakdown ({paymentData.range.label})
            </h2>
            <Button size="sm" variant="secondary" onClick={() => setShowClosingDialog(true)}>
              Daily Cash Closing
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Confirmed Collections</p>
              <p className="mt-2 text-xl font-bold tabular-nums text-emerald-700">{formatMoney(paymentData.confirmedCollectionsInPaise)}</p>
              <p className="mt-1 text-xs text-slate-500">Verified received funds</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pending Verification</p>
              <p className="mt-2 text-xl font-bold tabular-nums text-amber-600">{formatMoney(paymentData.pendingVerificationInPaise)}</p>
              <p className="mt-1 text-xs text-slate-500">Cheque / Bank transfer clearance</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Refunds Paid Out</p>
              <p className="mt-2 text-xl font-bold tabular-nums text-rose-600">{formatMoney(paymentData.refundPaymentsInPaise)}</p>
              <p className="mt-1 text-xs text-slate-500">Returns issued to customers</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Net Collections</p>
              <p className="mt-2 text-xl font-bold tabular-nums text-slate-900">{formatMoney(paymentData.netCollectionsInPaise)}</p>
              <p className="mt-1 text-xs text-slate-500">Confirmed - Refunds</p>
            </div>
          </div>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">Tender Methods</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="pb-2">Method</th>
                    <th className="pb-2 text-right">Transactions</th>
                    <th className="pb-2 text-right">Confirmed Amount</th>
                    <th className="pb-2 text-right">Pending Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paymentData.tenderBreakdown.map((t) => (
                    <tr key={t.method}>
                      <td className="py-2.5 font-semibold text-slate-900">{t.method}</td>
                      <td className="py-2.5 text-right tabular-nums text-slate-600">{t.transactionCount}</td>
                      <td className="py-2.5 text-right font-semibold tabular-nums text-emerald-700">
                        {formatMoney(t.confirmedInPaise)}
                      </td>
                      <td className="py-2.5 text-right font-medium tabular-nums text-amber-600">
                        {t.pendingInPaise > 0 ? formatMoney(t.pendingInPaise) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* TAB 4: Customer Receivables & Aging */}
      {!loading && !error && activeTab === "receivables" && receivablesData && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-xl border border-slate-200 bg-white p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Current (0d)</p>
              <p className="mt-1.5 text-base font-bold tabular-nums text-slate-900">{formatMoney(receivablesData.summary.currentInPaise)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">1–30 Days</p>
              <p className="mt-1.5 text-base font-bold tabular-nums text-amber-600">{formatMoney(receivablesData.summary.days1To30InPaise)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">31–60 Days</p>
              <p className="mt-1.5 text-base font-bold tabular-nums text-amber-700">{formatMoney(receivablesData.summary.days31To60InPaise)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">61–90 Days</p>
              <p className="mt-1.5 text-base font-bold tabular-nums text-rose-600">{formatMoney(receivablesData.summary.days61To90InPaise)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">&gt;90 Days</p>
              <p className="mt-1.5 text-base font-bold tabular-nums text-rose-700">{formatMoney(receivablesData.summary.over90DaysInPaise)}</p>
            </div>
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-900">Total Dues</p>
              <p className="mt-1.5 text-base font-bold tabular-nums text-indigo-950">{formatMoney(receivablesData.summary.totalOutstandingInPaise)}</p>
            </div>
          </div>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">Customer Balances</h3>
            {receivablesData.customers.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">All customer accounts are fully paid. No outstanding dues.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="pb-2">Customer</th>
                      <th className="pb-2">Phone</th>
                      <th className="pb-2 text-right">Outstanding Due</th>
                      <th className="pb-2 text-right">Days Overdue</th>
                      <th className="pb-2 text-right">Category</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {receivablesData.customers.map((c) => (
                      <tr key={c.customerId}>
                        <td className="py-2.5 font-semibold text-slate-900">{c.customerName}</td>
                        <td className="py-2.5 text-slate-600">{c.customerPhone || "—"}</td>
                        <td className="py-2.5 text-right font-bold tabular-nums text-rose-600">
                          {formatMoney(c.outstandingBalanceInPaise)}
                        </td>
                        <td className="py-2.5 text-right tabular-nums text-slate-600">
                          {c.daysOverdue} days
                        </td>
                        <td className="py-2.5 text-right">
                          <Badge tone={c.daysOverdue > 60 ? "danger" : c.daysOverdue > 30 ? "warning" : "info"}>
                            {c.agingCategory}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 5: Inventory Valuation & Stock Alerts */}
      {!loading && !error && activeTab === "inventory" && inventoryData && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Stock Valuation</p>
              <p className="mt-2 text-xl font-bold tabular-nums text-slate-900 sm:text-2xl">{formatMoney(inventoryData.inventoryValuationInPaise)}</p>
              <p className="mt-1 text-xs text-slate-500">Physical Stock × Unit Cost</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Physical Units in Stock</p>
              <p className="mt-2 text-xl font-bold tabular-nums text-slate-900 sm:text-2xl">{inventoryData.totalPhysicalStockQuantity.toLocaleString("en-IN")}</p>
              <p className="mt-1 text-xs text-slate-500">Across {inventoryData.totalSkusCount} SKUs</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Low Stock Alert</p>
              <p className="mt-2 text-xl font-bold tabular-nums text-amber-600 sm:text-2xl">{inventoryData.lowStockProductsCount}</p>
              <p className="mt-1 text-xs text-slate-500">At or below reorder threshold</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Out of Stock</p>
              <p className="mt-2 text-xl font-bold tabular-nums text-rose-600 sm:text-2xl">{inventoryData.outOfStockProductsCount}</p>
              <p className="mt-1 text-xs text-slate-500">Zero physical availability</p>
            </div>
          </div>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">Reorder &amp; Low Stock Items</h3>
            {inventoryData.lowStockItems.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">All products have healthy inventory levels above their reorder thresholds.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="pb-2">Product</th>
                      <th className="pb-2">SKU</th>
                      <th className="pb-2 text-right">Available</th>
                      <th className="pb-2 text-right">Min Threshold</th>
                      <th className="pb-2 text-right">Unit Cost</th>
                      <th className="pb-2 text-right">Valuation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {inventoryData.lowStockItems.map((item) => (
                      <tr key={item.id}>
                        <td className="py-2.5 font-semibold text-slate-900">{item.name}</td>
                        <td className="py-2.5 text-slate-500">{item.sku}</td>
                        <td className="py-2.5 text-right font-bold tabular-nums text-rose-600">{item.stock} {item.unit}</td>
                        <td className="py-2.5 text-right tabular-nums text-slate-600">{item.minStockThreshold}</td>
                        <td className="py-2.5 text-right tabular-nums text-slate-600">{formatMoney(item.costInPaise)}</td>
                        <td className="py-2.5 text-right font-semibold tabular-nums text-slate-900">{formatMoney(item.valuationInPaise)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 6: Staff Performance */}
      {!loading && !error && activeTab === "staff" && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">
            Staff Billing &amp; Collection Performance
          </h2>
          {staffData.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">No staff activity found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                    <th className="pb-2.5">Staff Member</th>
                    <th className="pb-2.5">Role</th>
                    <th className="pb-2.5 text-right">Bills Created</th>
                    <th className="pb-2.5 text-right">Sales Value</th>
                    <th className="pb-2.5 text-right">Collected</th>
                    <th className="pb-2.5 text-right">Avg Bill</th>
                    <th className="pb-2.5 text-right">Discounts</th>
                    <th className="pb-2.5 text-right">Cancelled</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {staffData.map((s) => (
                    <tr key={s.staffId}>
                      <td className="py-2.5 font-semibold text-slate-900">{s.name}</td>
                      <td className="py-2.5"><Badge tone="info">{s.role}</Badge></td>
                      <td className="py-2.5 text-right tabular-nums text-slate-700">{s.billsCreatedCount}</td>
                      <td className="py-2.5 text-right font-semibold tabular-nums text-slate-900">{formatMoney(s.totalSalesInPaise)}</td>
                      <td className="py-2.5 text-right font-semibold tabular-nums text-emerald-700">{formatMoney(s.collectedPaymentInPaise)}</td>
                      <td className="py-2.5 text-right tabular-nums text-slate-700">{formatMoney(s.averageBillValueInPaise)}</td>
                      <td className="py-2.5 text-right tabular-nums text-slate-500">{formatMoney(s.discountsGivenInPaise)}</td>
                      <td className="py-2.5 text-right tabular-nums text-rose-600">{s.cancelledBillsCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* TAB 7: Operating Expenses */}
      {!loading && !error && activeTab === "expenses" && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-semibold text-slate-900">
              Operating Expenses Ledger
            </h2>
            <Button size="sm" variant="primary" onClick={() => setShowExpenseDialog(true)}>
              + Record Expense
            </Button>
          </div>

          {expensesData.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500">
              No expenses recorded yet. Click &ldquo;Record Expense&rdquo; to add rent, utilities, or salary entries.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                    <th className="pb-2">Expense #</th>
                    <th className="pb-2">Category</th>
                    <th className="pb-2">Description</th>
                    <th className="pb-2">Date</th>
                    <th className="pb-2 text-right">Amount</th>
                    <th className="pb-2">Method</th>
                    <th className="pb-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {expensesData.map((exp) => (
                    <tr key={String(exp._id)}>
                      <td className="py-2.5 font-mono text-[11px] text-slate-600">{exp.expenseNumber}</td>
                      <td className="py-2.5 font-semibold text-slate-900">{exp.category}</td>
                      <td className="py-2.5 text-slate-700 max-w-[200px] truncate">{exp.description}</td>
                      <td className="py-2.5 text-slate-500">{new Date(exp.expenseDate).toLocaleDateString("en-IN")}</td>
                      <td className="py-2.5 text-right font-bold tabular-nums text-slate-900">{formatMoney(exp.amountInPaise)}</td>
                      <td className="py-2.5 text-slate-600">{exp.paymentMethod}</td>
                      <td className="py-2.5 text-right">
                        <Badge tone={exp.status === "APPROVED" || exp.status === "PAID" ? "success" : exp.status === "PENDING" ? "warning" : "danger"}>
                          {exp.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* TAB 8: Daily Cash Closing */}
      {!loading && !error && activeTab === "closing" && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-semibold text-slate-900">
              Daily Cash Closing &amp; Reconciliation History
            </h2>
            <Button size="sm" variant="primary" onClick={() => setShowClosingDialog(true)}>
              + Today&apos;s Cash Closing
            </Button>
          </div>

          {closingData.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500">
              No historical daily closing records found. Click &ldquo;Today&apos;s Cash Closing&rdquo; to reconcile today&apos;s drawer cash.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                    <th className="pb-2">Closing #</th>
                    <th className="pb-2">Date</th>
                    <th className="pb-2 text-right">Opening Cash</th>
                    <th className="pb-2 text-right">Cash Sales</th>
                    <th className="pb-2 text-right">Expected Cash</th>
                    <th className="pb-2 text-right">Actual Counted</th>
                    <th className="pb-2 text-right">Difference</th>
                    <th className="pb-2">Closed By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {closingData.map((c) => (
                    <tr key={String(c._id)}>
                      <td className="py-2.5 font-mono text-[11px] text-slate-600">{c.closingNumber}</td>
                      <td className="py-2.5 font-semibold text-slate-900">{c.closingDate}</td>
                      <td className="py-2.5 text-right tabular-nums text-slate-600">{formatMoney(c.openingCashInPaise)}</td>
                      <td className="py-2.5 text-right tabular-nums text-emerald-700">+{formatMoney(c.cashSalesInPaise)}</td>
                      <td className="py-2.5 text-right tabular-nums font-semibold text-slate-900">{formatMoney(c.expectedClosingCashInPaise)}</td>
                      <td className="py-2.5 text-right tabular-nums font-bold text-slate-900">{formatMoney(c.actualCountedCashInPaise)}</td>
                      <td className={`py-2.5 text-right tabular-nums font-bold ${c.differenceInPaise === 0 ? "text-emerald-600" : c.differenceInPaise > 0 ? "text-blue-600" : "text-rose-600"}`}>
                        {c.differenceInPaise > 0 ? "+" : ""}{formatMoney(c.differenceInPaise)}
                      </td>
                      <td className="py-2.5 text-slate-600">{c.closedByName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Dialogs */}
      {showExpenseDialog && (
        <AddExpenseDialog
          onClose={() => setShowExpenseDialog(false)}
          onDone={() => setReloadKey((k) => k + 1)}
        />
      )}

      {showClosingDialog && (
        <DailyClosingDialog
          onClose={() => setShowClosingDialog(false)}
          onDone={() => setReloadKey((k) => k + 1)}
        />
      )}
    </div>
  );
}
