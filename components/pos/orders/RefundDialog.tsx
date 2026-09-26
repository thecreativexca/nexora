"use client";

import { useState } from "react";

import { postJson } from "@/components/pos/api";
import { Button } from "@/components/ui/Button";
import { CloseIcon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/Spinner";
import { REFUND_REASON_MAX_LENGTH, REFUND_REASON_MIN_LENGTH, REFUND_REASON_OPTIONS } from "@/lib/constants/order";
import { cn } from "@/lib/utils/cn";
import { formatMoney } from "@/lib/utils/money";
import type {
  StaffOrderDetail,
  StaffOrderRefundResult,
} from "@/types/order";

/**
 * Refund confirmation dialog. Refunds are permanent (no cancel/undo path
 * exists) and restore physical stock, so the confirm copy makes that explicit
 * and the button stays disabled until a real reason is provided.
 */
export function RefundDialog({
  order,
  onClose,
  onDone,
}: {
  order: StaffOrderDetail;
  onClose: () => void;
  onDone: (outcome: StaffOrderRefundResult) => void;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const customReasonLength = reason.trim().length;
  const canSubmit =
    customReasonLength >= REFUND_REASON_MIN_LENGTH && !submitting;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setErrorMessage(null);

    const result = await postJson<StaffOrderRefundResult>(
      `/api/pos/orders/${encodeURIComponent(order.orderNumber)}/refund`,
      { reason: reason.trim() },
    );

    if (result.ok) {
      onDone(result.data);
      onClose();
      return;
    }
    setErrorMessage(result.message);
    setSubmitting(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="refund-title"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 id="refund-title" className="text-base font-semibold text-slate-900">
            Refund order {order.orderNumber}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Close refund dialog"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <p className="font-semibold">This refund cannot be undone.</p>
            <p className="mt-1">
              The full amount of {formatMoney(order.totalInPaise)} will be returned to
              the customer and physical items on this order will be added back to stock.
            </p>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">
              Reason
              <span className="text-rose-600"> *</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {REFUND_REASON_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setReason(option)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                    reason === option
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={REFUND_REASON_MAX_LENGTH}
              rows={3}
              placeholder="Or type your own reason..."
              className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
            <p className="mt-1 text-right text-xs text-slate-500">
              {customReasonLength}/{REFUND_REASON_MAX_LENGTH}
            </p>
          </div>

          {errorMessage ? (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {errorMessage}
            </p>
          ) : null}
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 px-5 py-4">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="danger" onClick={submit} disabled={!canSubmit}>
            {submitting ? <Spinner className="border-rose-200 border-t-white" /> : null}
            {submitting ? "Refunding..." : "Confirm refund"}
          </Button>
        </div>
      </div>
    </div>
  );
}