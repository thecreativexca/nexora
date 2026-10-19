"use client";

import { useState } from "react";

import { postJson } from "@/components/pos/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CloseIcon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/Spinner";
import {
  PAYMENT_METHOD,
  PAYMENT_METHOD_LABELS,
  POS_PAYMENT_METHODS,
  type PaymentMethod,
} from "@/lib/constants/order";
import { formatMoney } from "@/lib/utils/money";
import type { StaffOrderDetail } from "@/types/order";

interface ReturnItemState {
  productId: string;
  quantity: number;
  condition: "sellable" | "damaged";
  reason: string;
}

export function ReturnDialog({
  order,
  onClose,
  onDone,
}: {
  order: StaffOrderDetail;
  onClose: () => void;
  onDone: () => void;
}) {
  const [returnItems, setReturnItems] = useState<Record<string, ReturnItemState>>({});
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>(
    order.paymentMethod === PAYMENT_METHOD.SPLIT ? PAYMENT_METHOD.CASH : order.paymentMethod,
  );
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const toggleItem = (productId: string, maxQty: number) => {
    setReturnItems((prev) => {
      const next = { ...prev };
      if (next[productId]) {
        delete next[productId];
      } else {
        next[productId] = {
          productId,
          quantity: 1,
          condition: "sellable",
          reason: "Customer return",
        };
      }
      return next;
    });
  };

  const updateItemQty = (productId: string, quantity: number, maxQty: number) => {
    const qty = Math.max(1, Math.min(maxQty, quantity));
    setReturnItems((prev) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        quantity: qty,
      },
    }));
  };

  const updateItemCondition = (productId: string, condition: "sellable" | "damaged") => {
    setReturnItems((prev) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        condition,
      },
    }));
  };

  // Calculate estimated refund
  const estimatedRefundInPaise = Object.values(returnItems).reduce((sum, item) => {
    const original = order.items.find((i) => i.productId === item.productId);
    return sum + (original ? original.unitPriceInPaise * item.quantity : 0);
  }, 0);

  const hasSelectedItems = Object.keys(returnItems).length > 0;

  async function submitReturn() {
    if (!hasSelectedItems || submitting) return;
    setSubmitting(true);
    setErrorMessage(null);

    const items = Object.values(returnItems);
    const result = await postJson(
      `/api/pos/orders/${encodeURIComponent(order.orderNumber)}/return`,
      {
        items,
        refundMethod,
        referenceNumber: referenceNumber.trim() || undefined,
        notes: notes.trim() || undefined,
      },
    );

    if (result.ok) {
      onDone();
      onClose();
    } else {
      setErrorMessage(result.message);
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="return-title"
    >
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="return-title" className="text-base font-semibold text-slate-900">
              Process Return / Exchange
            </h2>
            <p className="text-xs text-slate-500">Order #{order.orderNumber}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Close return dialog"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Select items to return:
          </p>

          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {order.items.map((item) => {
              const selected = Boolean(returnItems[item.productId]);
              const current = returnItems[item.productId];

              return (
                <div key={item.productId} className="p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleItem(item.productId, item.quantity)}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-0"
                      />
                      <div>
                        <p className="font-semibold text-slate-900">{item.productName}</p>
                        <p className="text-xs text-slate-500">
                          {item.sku} · Max returnable: {item.quantity} · {formatMoney(item.unitPriceInPaise)} each
                        </p>
                      </div>
                    </label>
                    <span className="font-semibold text-slate-900">
                      {formatMoney(item.lineTotalInPaise)}
                    </span>
                  </div>

                  {selected && current ? (
                    <div className="mt-3 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-2.5">
                      <div>
                        <label className="block text-xs font-medium text-slate-600">Qty to return</label>
                        <input
                          type="number"
                          min={1}
                          max={item.quantity}
                          value={current.quantity}
                          onChange={(e) =>
                            updateItemQty(item.productId, parseInt(e.target.value, 10) || 1, item.quantity)
                          }
                          className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-sm font-semibold"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600">Condition</label>
                        <select
                          value={current.condition}
                          onChange={(e) =>
                            updateItemCondition(item.productId, e.target.value as "sellable" | "damaged")
                          }
                          className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs font-medium"
                        >
                          <option value="sellable">Sellable (restock)</option>
                          <option value="damaged">Damaged (write-off)</option>
                        </select>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {/* Refund tender & details */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-slate-700">Estimated refund amount:</span>
              <span className="text-base font-bold text-slate-900">
                {formatMoney(estimatedRefundInPaise)}
              </span>
            </div>

            <div className="mt-3">
              <label className="block text-xs font-medium text-slate-600">Offline refund method</label>
              <select
                value={refundMethod}
                onChange={(e) => setRefundMethod(e.target.value as PaymentMethod)}
                className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium"
              >
                {POS_PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-2.5">
              <label className="block text-xs font-medium text-slate-600">Reference / Transaction ID (optional)</label>
              <input
                type="text"
                placeholder="e.g. Cash voucher / UPI ref"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                className="mt-1 h-8 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs"
              />
            </div>

            <div className="mt-2.5">
              <label className="block text-xs font-medium text-slate-600">Notes / Reason</label>
              <input
                type="text"
                placeholder="Return rationale"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1 h-8 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs"
              />
            </div>
          </div>

          {errorMessage ? (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {errorMessage}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-5 py-3">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!hasSelectedItems || submitting}
            onClick={() => void submitReturn()}
          >
            {submitting ? <Spinner className="h-4 w-4" /> : null}
            Process return ({formatMoney(estimatedRefundInPaise)})
          </Button>
        </div>
      </div>
    </div>
  );
}
