"use client";

import { useEffect, useState } from "react";

import { getJson, patchJson } from "@/components/pos/api";
import { RefundDialog } from "@/components/pos/orders/RefundDialog";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { AlertIcon, CloseIcon, RefreshIcon } from "@/components/ui/icons";
import { Price } from "@/components/ui/Price";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { ORDER_CHANNEL_LABELS, ORDER_STATUS_LABELS } from "@/lib/constants/order";
import { formatDateTime } from "@/lib/utils/format";
import { formatMoney } from "@/lib/utils/money";
import type {
  OrderStatus,
} from "@/lib/constants/order";
import type { StaffOrderDetail, StaffOrderRefundResult } from "@/types/order";

/**
 * Full order detail dialog. Everything rendered comes from the order's own
 * snapshot - product names, prices and SKUs are never re-read live from the
 * catalogue, so the view stays historically accurate.
 */
export function OrderDetailDialog({
  orderNumber,
  canChangeStatus,
  canIssueRefund,
  onClose,
  onOrderChanged,
}: {
  orderNumber: string;
  canChangeStatus: boolean;
  canIssueRefund: boolean;
  onClose: () => void;
  onOrderChanged: () => void;
}) {
  const [order, setOrder] = useState<StaffOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [busyStatus, setBusyStatus] = useState<OrderStatus | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [refundOpen, setRefundOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError(null);
      const result = await getJson<{ order: StaffOrderDetail }>(
        `/api/pos/orders/${encodeURIComponent(orderNumber)}`,
      );
      if (cancelled) return;
      setLoading(false);
      if (result.ok) {
        setOrder(result.data.order);
      } else {
        setError(result.message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orderNumber, reloadKey]);

  async function changeStatus(next: OrderStatus) {
    setBusyStatus(next);
    setActionError(null);
    const result = await patchJson<{ order: StaffOrderDetail }>(
      `/api/pos/orders/${encodeURIComponent(orderNumber)}/status`,
      { newStatus: next },
    );
    setBusyStatus(null);
    if (result.ok) {
      setOrder(result.data.order);
      onOrderChanged();
    } else {
      setActionError(result.message);
    }
  }

  function handleRefundDone(outcome: StaffOrderRefundResult) {
    setOrder(outcome.order);
    if (outcome.missingProducts.length > 0) {
      setNotice(
        "Refund completed, but some products no longer exist in the catalogue so " +
          "their stock could not be restored.",
      );
    }
    onOrderChanged();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-detail-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 id="order-detail-title" className="text-base font-semibold text-slate-900">
            Order {orderNumber}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Close order detail"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
              <Spinner /> Loading order...
            </div>
          ) : error ? (
            <ErrorState
              title="Could not load this order"
              description={error}
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setReloadKey((key) => key + 1)}
                >
                  <RefreshIcon className="h-4 w-4" /> Try again
                </Button>
              }
            />
          ) : order ? (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={order.statusTone}>{order.statusLabel}</Badge>
                <Badge tone="neutral">
                  {ORDER_CHANNEL_LABELS[order.channel]}
                </Badge>
                {order.refunded ? <Badge tone="danger">Refunded</Badge> : null}
                <span className="ml-auto text-sm text-slate-500">
                  Placed {formatDateTime(order.placedAt)}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Customer
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-900">
                    {order.customerName || "Guest"}
                  </p>
                  {order.customerEmail ? (
                    <p className="text-sm text-slate-600">{order.customerEmail}</p>
                  ) : null}
                  {order.customerPhone ? (
                    <p className="text-sm text-slate-600">{order.customerPhone}</p>
                  ) : null}
                </div>

                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Payment
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-900">
                    {order.paymentMethodLabel}
                  </p>
                  <Badge tone="neutral" className="mt-1">
                    {order.paymentStatusLabel}
                  </Badge>
                </div>

                {order.placedByName ? (
                  <div className="rounded-xl border border-slate-200 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Server
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-900">
                      {order.placedByName}
                    </p>
                  </div>
                ) : null}

                {order.channel === "ONLINE" &&
                (order.deliveryAddress.line1 ||
                  order.deliveryAddress.city ||
                  order.deliveryAddress.postalCode) ? (
                  <div className="rounded-xl border border-slate-200 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Delivery address
                    </p>
                    <p className="mt-1 text-sm text-slate-900">
                      {order.deliveryAddress.line1}
                      {order.deliveryAddress.line2
                        ? `, ${order.deliveryAddress.line2}`
                        : ""}
                      <br />
                      {order.deliveryAddress.city}, {order.deliveryAddress.state}{" "}
                      {order.deliveryAddress.postalCode}
                    </p>
                  </div>
                ) : null}
              </div>

              {order.notes ? (
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Notes
                  </p>
                  <p className="mt-1 text-sm whitespace-pre-wrap text-slate-700">
                    {order.notes}
                  </p>
                </div>
              ) : null}

              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-900">
                  Items ({order.itemCount})
                </h3>
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {order.items.map((item) => (
                    <li key={item.productId} className="flex items-center gap-3 px-3 py-2.5">
                      <span className="text-sm font-medium text-slate-900">
                        {item.quantity}×
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-slate-900">
                          {item.productName}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {item.sku}
                        </span>
                      </span>
                      {item.isService ? (
                        <Badge tone="info">Service</Badge>
                      ) : null}
                      <Price amountInPaise={item.lineTotalInPaise} className="text-sm" />
                    </li>
                  ))}
                </ul>

                <div className="mt-3 space-y-1 rounded-xl bg-slate-50 px-3 py-2.5 text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal</span>
                    <Price amountInPaise={order.subtotalInPaise} />
                  </div>
                  {order.discountInPaise > 0 ? (
                    <div className="flex justify-between text-slate-600">
                      <span>Discount</span>
                      <span className="text-emerald-700">
                        −{formatMoney(order.discountInPaise)}
                      </span>
                    </div>
                  ) : null}
                  <div className="flex justify-between text-slate-600">
                    <span>Tax</span>
                    <Price amountInPaise={order.taxInPaise} />
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold text-slate-900">
                    <span>Total</span>
                    <Price amountInPaise={order.totalInPaise} />
                  </div>
                </div>
              </div>

              {order.refunds.length > 0 ? (
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-slate-900">
                    Refund records
                  </h3>
                  <ul className="space-y-2">
                    {order.refunds.map((refund, index) => (
                      <li
                        key={`${refund.processedAt ?? "unknown"}-${index}`}
                        className="rounded-xl border border-rose-200 bg-rose-50/50 px-3 py-2.5 text-sm"
                      >
                        <div className="flex items-center justify-between font-medium text-rose-900">
                          <span>
                            {formatMoney(refund.amountInPaise)}{" "}
                            <Badge tone="danger" className="ml-1">
                              {refund.statusLabel}
                            </Badge>
                          </span>
                          {refund.processedAt ? (
                            <span className="text-xs font-normal text-rose-700">
                              {formatDateTime(refund.processedAt)}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-rose-800">{refund.reason}</p>
                        {refund.processedByStaffName ? (
                          <p className="mt-1 text-xs text-rose-700">
                            Processed by {refund.processedByStaffName}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {actionError ? (
                <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {actionError}
                </p>
              ) : null}

              {notice ? (
                <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  {notice}
                </p>
              ) : null}

              {canChangeStatus && order.allowedNextStatuses.length > 0 ? (
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Move to next stage
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {order.allowedNextStatuses.map((next) => (
                      <Button
                        key={next}
                        variant="secondary"
                        size="sm"
                        disabled={busyStatus !== null}
                        onClick={() => void changeStatus(next)}
                      >
                        {busyStatus === next ? (
                          <Spinner className="h-3.5 w-3.5" />
                        ) : null}
                        {ORDER_STATUS_LABELS[next]}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}

              {canIssueRefund && order.refundable ? (
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Refund
                  </p>
                  <p className="mb-3 text-sm text-slate-600">
                    Issue a full refund of {formatMoney(order.totalInPaise)}. Stock on
                    physical items is restored automatically.
                  </p>
                  <Button variant="danger" size="sm" onClick={() => setRefundOpen(true)}>
                    Issue refund
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <EmptyState title="Order not found" />
          )}
        </div>
      </div>

      {refundOpen && order ? (
        <RefundDialog
          order={order}
          onClose={() => setRefundOpen(false)}
          onDone={handleRefundDone}
        />
      ) : null}
    </div>
  );
}