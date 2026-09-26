"use client";

import { useEffect, useState } from "react";

import { getJson } from "@/components/pos/api";
import { OrderDetailDialog } from "@/components/pos/orders/OrderDetailDialog";
import { PaginationControl } from "@/components/pos/Pagination";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { RefreshIcon, SearchIcon, TruckIcon } from "@/components/ui/icons";
import { Price } from "@/components/ui/Price";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import {
  ORDER_CHANNEL_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_VALUES,
  type OrderChannel,
  type OrderStatus,
} from "@/lib/constants/order";
import {
  STAFF_PERMISSION,
  staffHasPermission,
  type StaffRole,
} from "@/lib/constants/staff";
import { cn } from "@/lib/utils/cn";
import { formatDateTime } from "@/lib/utils/format";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import type {
  StaffOrderListResult,
  StaffOrderSummary,
} from "@/types/order";

type ChannelFilter = "ALL" | OrderChannel;

const CHANNEL_FILTERS: { value: ChannelFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "IN_STORE", label: "In-store" },
  { value: "ONLINE", label: "Online" },
];

/**
 * Orders management list (Phase 5). Reads BOTH channels from the same Order
 * collection; filter/search/pagination are server-side, matching the register's
 * item list pattern. Rows open a full order detail dialog; status moves and
 * refunds are shown only when the role actually holds those permissions.
 */
export function OrdersView({ role }: { role: StaffRole }) {
  const canChangeStatus = staffHasPermission(role, STAFF_PERMISSION.MANAGE_ORDER_STATUS);
  const canIssueRefund = staffHasPermission(role, STAFF_PERMISSION.ISSUE_REFUND);

  const [channel, setChannel] = useState<ChannelFilter>("ALL");
  const [status, setStatus] = useState<OrderStatus | "">("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);

  const [orders, setOrders] = useState<StaffOrderSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedOrderNumber, setSelectedOrderNumber] = useState<string | null>(null);

  const debouncedSearch = useDebouncedValue(search, 300);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setLoadError(null);

      const params = new URLSearchParams({ page: String(page) });
      if (channel !== "ALL") params.set("channel", channel);
      if (status) params.set("status", status);
      const term = debouncedSearch.trim();
      if (term) params.set("search", term);

      const result = await getJson<StaffOrderListResult>(
        `/api/pos/orders?${params.toString()}`,
      );
      if (cancelled) return;
      setLoading(false);
      if (result.ok) {
        setOrders(result.data.orders);
        setTotal(result.data.total);
        setTotalPages(Math.max(1, result.data.totalPages));
      } else {
        setOrders([]);
        setTotal(0);
        setTotalPages(1);
        setLoadError(result.message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [channel, status, debouncedSearch, page, reloadKey]);

  function applyFilters(nextChannel: ChannelFilter) {
    setChannel(nextChannel);
    setPage(1);
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Orders</h1>
          <p className="mt-1 text-sm text-slate-600">
            {loading
              ? "Loading orders..."
              : `${total.toLocaleString("en-IN")} order${total === 1 ? "" : "s"}`}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search order number..."
            maxLength={40}
            className="h-10 w-64 rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            aria-label="Search orders by number"
          />
        </div>

        <div className="flex rounded-lg border border-slate-300 p-0.5" role="group" aria-label="Channel filter">
          {CHANNEL_FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => applyFilters(option.value)}
              className={cn(
                "h-8 rounded-md px-3 text-sm font-medium transition-colors",
                channel === option.value
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as OrderStatus | "");
            setPage(1);
          }}
          className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {ORDER_STATUS_VALUES.map((value) => (
            <option key={value} value={value}>
              {ORDER_STATUS_LABELS[value]}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 py-16 text-sm text-slate-500">
          <Spinner /> Loading orders...
        </div>
      ) : loadError ? (
        <ErrorState
          title="Could not load orders"
          description={loadError}
          action={
            <Button variant="secondary" size="sm" onClick={() => setReloadKey((key) => key + 1)}>
              <RefreshIcon className="h-4 w-4" /> Try again
            </Button>
          }
        />
      ) : orders.length === 0 ? (
        <EmptyState
          title="No orders found"
          description={
            search.trim() || status || channel !== "ALL"
              ? "Try clearing the filters or the search term."
              : "Orders will appear here once the first sale is placed."
          }
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-left">
              <thead className="bg-slate-50">
                <tr className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th scope="col" className="px-4 py-3">Order</th>
                  <th scope="col" className="px-4 py-3">Placed</th>
                  <th scope="col" className="px-4 py-3">Channel</th>
                  <th scope="col" className="px-4 py-3">Customer</th>
                  <th scope="col" className="px-4 py-3 text-right">Items</th>
                  <th scope="col" className="px-4 py-3">Payment</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3 text-right">Total</th>
                  {channel === "IN_STORE" ? (
                    <th scope="col" className="px-4 py-3">Server</th>
                  ) : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {orders.map((order) => (
                  <tr
                    key={order.orderNumber}
                    onClick={() => setSelectedOrderNumber(order.orderNumber)}
                    className="cursor-pointer transition-colors hover:bg-slate-50"
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-medium text-slate-900">
                        {order.orderNumber}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {formatDateTime(order.placedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone="neutral" className={order.channel === "ONLINE" ? "bg-sky-50 text-sky-700 ring-sky-200" : undefined}>
                        {order.channel === "ONLINE" ? (
                          <TruckIcon className="h-3 w-3" />
                        ) : null}
                        {ORDER_CHANNEL_LABELS[order.channel]}
                      </Badge>
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-3 text-sm text-slate-700">
                      {order.customerName || (order.customerEmail || "Guest")}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-600 tabular-nums">
                      {order.itemCount}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-slate-700">{order.paymentMethodLabel}</span>
                      {order.refunded ? (
                        <span className="ml-1 text-xs text-rose-600">refunded</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      {order.refunded ? (
                        <Badge tone="danger">{ORDER_STATUS_LABELS[order.status]}</Badge>
                      ) : (
                        <Badge tone={order.statusTone}>{order.statusLabel}</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Price amountInPaise={order.totalInPaise} className="text-sm font-medium" />
                    </td>
                    {channel === "IN_STORE" ? (
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {order.placedByName ?? "—"}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <PaginationControl
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </>
      )}

      {selectedOrderNumber ? (
        <OrderDetailDialog
          orderNumber={selectedOrderNumber}
          canChangeStatus={canChangeStatus}
          canIssueRefund={canIssueRefund}
          onClose={() => setSelectedOrderNumber(null)}
          onOrderChanged={() => setReloadKey((key) => key + 1)}
        />
      ) : null}
    </div>
  );
}