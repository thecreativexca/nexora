"use client";

import { useState } from "react";

import { Logo } from "@/components/common/Logo";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Price } from "@/components/ui/Price";
import { formatDateTime } from "@/lib/utils/format";
import { formatMoney } from "@/lib/utils/money";
import { PAYMENT_METHOD } from "@/lib/constants/order";
import type { PosReceipt } from "@/types/pos";

export function ReceiptPanel({
  receipt,
  onNewSale,
  onClose,
}: {
  receipt: PosReceipt;
  onNewSale?: () => void;
  onClose?: () => void;
}) {
  const [paper, setPaper] = useState<"58mm" | "80mm" | "a4">("80mm");
  const showChange = receipt.paymentMethod === PAYMENT_METHOD.CASH && receipt.changeInPaise > 0;
  const isPendingVerification = receipt.paymentStatus === "PENDING_VERIFICATION";
  const hasDues = (receipt.outstandingDueInPaise ?? 0) > 0;

  const handleDismiss = onClose ?? onNewSale;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6 print:fixed print:inset-0 print:bg-white print:p-0"
      role="dialog"
      aria-modal="true"
      aria-label="Sale receipt"
    >
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/10 print:max-h-none print:w-auto print:max-w-none print:rounded-none print:shadow-none print:ring-0">
        {/* Fixed Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5 py-3.5 sm:px-6 print:hidden">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </span>
            <div>
              <p className="text-sm font-bold text-slate-900">Sale completed</p>
              <p className="text-xs text-slate-500 font-mono">Invoice {receipt.orderNumber}</p>
            </div>
          </div>
          {handleDismiss ? (
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Close receipt"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            >
              <span className="text-lg leading-none">✕</span>
            </button>
          ) : null}
        </div>

        {/* Scrollable Receipt Sheet */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 print:overflow-visible print:p-0 no-scrollbar">
          <div
            data-receipt-paper={paper}
            className="receipt-sheet mx-auto w-full max-w-md bg-white print:max-w-none"
          >
            {/* Business Brand Header */}
            <div className="border-b border-dashed border-slate-300 pb-4 text-center">
              <div className="flex justify-center">
                <Logo />
              </div>
              {receipt.business?.address ? (
                <p className="mt-2 text-xs text-slate-600">{receipt.business.address}</p>
              ) : null}
              {receipt.business?.contact ? (
                <p className="text-xs text-slate-600">{receipt.business.contact}</p>
              ) : null}
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                In-store receipt / Tax Invoice
              </p>
            </div>

            {/* Order Meta & Status */}
            <div className="border-b border-dashed border-slate-300 py-3.5 text-center">
              <p className="font-mono text-xl font-black tracking-wide text-slate-900">{receipt.orderNumber}</p>
              <p className="mt-1 text-xs text-slate-500">{formatDateTime(receipt.createdAt)}</p>
              <div className="mt-2.5 flex items-center justify-center gap-2 print:hidden">
                <Badge tone="success">{receipt.statusLabel}</Badge>
                <Badge tone={isPendingVerification ? "warning" : "success"}>
                  {receipt.paymentMethodLabel} · {receipt.paymentStatusLabel}
                </Badge>
              </div>
              {isPendingVerification ? (
                <p className="mt-2 text-xs text-amber-700">
                  ⚠ Payment pending manual verification by staff.
                </p>
              ) : null}
            </div>

            {/* Customer & Billed By */}
            {(receipt.customerName || receipt.customerEmail || receipt.customerPhone || receipt.staffName) ? (
              <div className="space-y-1 border-b border-dashed border-slate-300 py-3 text-xs text-slate-700">
                {receipt.customerName ? (
                  <p>
                    <span className="font-semibold text-slate-900">Customer:</span> {receipt.customerName}
                    {receipt.customerPhone ? ` · ${receipt.customerPhone}` : ""}
                    {receipt.customerEmail ? ` · ${receipt.customerEmail}` : ""}
                  </p>
                ) : null}
                {receipt.staffName ? (
                  <p>
                    <span className="font-semibold text-slate-900">Billed by:</span> {receipt.staffName}
                  </p>
                ) : null}
              </div>
            ) : null}

            {/* Items */}
            <div className="py-2">
              <ul className="divide-y divide-slate-100">
                {receipt.items.map((item) => (
                  <li key={item.productId} className="flex items-start justify-between gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-semibold text-slate-900">{item.productName}</p>
                      <p className="text-xs text-slate-500">
                        {item.sku} × {item.quantity} {item.unit || "Piece"}
                        {item.taxRate && item.taxRate > 0 ? ` (GST ${item.taxRate}%)` : ""}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <Price amountInPaise={item.lineTotalInPaise} className="text-sm font-bold text-slate-900" />
                      <p className="text-[11px] text-slate-400">{formatMoney(item.unitPriceInPaise)} each</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Totals Breakdown */}
            <div className="space-y-1.5 border-t border-dashed border-slate-300 pt-3">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>Subtotal ({receipt.itemCount} {receipt.itemCount === 1 ? "item" : "items"})</span>
                <Price amountInPaise={receipt.subtotalInPaise} className="font-semibold text-slate-900" />
              </div>

              {receipt.taxInPaise > 0 ? (
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>Taxes (GST)</span>
                  <span className="font-semibold text-slate-900">{formatMoney(receipt.taxInPaise)}</span>
                </div>
              ) : null}

              {receipt.discountInPaise > 0 ? (
                <div className="flex items-center justify-between text-xs text-emerald-700">
                  <span>Discount</span>
                  <span className="font-semibold">-{formatMoney(receipt.discountInPaise)}</span>
                </div>
              ) : null}

              <div className="flex items-center justify-between border-t border-slate-200 pt-2 pb-1">
                <span className="text-sm font-bold text-slate-900">Total</span>
                <span className="text-lg font-black text-slate-900">
                  {formatMoney(receipt.totalInPaise)}
                </span>
              </div>

              {/* Cash payment breakdown */}
              {receipt.paymentMethod === PAYMENT_METHOD.CASH && receipt.amountPaidInPaise > 0 ? (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span>Cash received</span>
                    <span className="font-semibold text-slate-900">
                      {formatMoney(receipt.amountPaidInPaise + receipt.changeInPaise)}
                    </span>
                  </div>
                  {showChange ? (
                    <div className="flex items-center justify-between rounded-xl border border-emerald-200/80 bg-emerald-50 px-3.5 py-2">
                      <span className="text-xs font-bold text-emerald-800">Change returned</span>
                      <span className="text-base font-black text-emerald-900">{formatMoney(receipt.changeInPaise)}</span>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>Amount Paid</span>
                  <span className="font-semibold text-slate-900">{formatMoney(receipt.amountPaidInPaise)}</span>
                </div>
              )}

              {hasDues ? (
                <div className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <span className="font-semibold">Balance Due</span>
                  <span className="font-bold text-amber-900">{formatMoney(receipt.outstandingDueInPaise)}</span>
                </div>
              ) : null}

              <p className="pt-2 text-center text-[11px] text-slate-500">
                {isPendingVerification
                  ? `Payment via ${receipt.paymentMethodLabel} — pending verification. Thank you for shopping with Nexora.`
                  : `Paid via ${receipt.paymentMethodLabel}. Thank you for shopping with Nexora.`}
              </p>
            </div>
          </div>
        </div>

        {/* Fixed Footer Actions */}
        <div className="shrink-0 space-y-3 border-t border-slate-200 bg-slate-50/90 px-5 py-4 backdrop-blur sm:px-6 print:hidden">
          <label className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-700">
            Paper size
            <select
              value={paper}
              onChange={(event) => setPaper(event.target.value as typeof paper)}
              className="h-8 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-800 shadow-sm focus:border-slate-900 focus:ring-0"
            >
              <option value="58mm">58mm thermal</option>
              <option value="80mm">80mm thermal</option>
              <option value="a4">A4 sheet</option>
            </select>
          </label>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="md"
              className="flex-1"
              onClick={() => window.print()}
            >
              Print Bill
            </Button>
            <a
              href={`/api/pos/orders/${encodeURIComponent(receipt.orderNumber)}/receipt?format=pdf`}
              download
              className="inline-flex min-h-10 flex-1 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50 transition-colors"
            >
              Download PDF
            </a>
            <Button size="md" className="flex-1 font-semibold" onClick={onNewSale ?? onClose}>
              {onNewSale ? "New sale" : "Close"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
