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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 print:p-0 print:bg-white print:fixed print:inset-0"
      role="dialog"
      aria-modal="true"
      aria-label="Sale receipt"
    >
      <div data-receipt-paper={paper} className="receipt-sheet max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl print:max-h-none print:p-2 print:shadow-none">
        <div className="border-b border-dashed border-slate-300 pb-4 text-center">
          <div className="flex justify-center"><Logo compact /></div>
          <h2 className="mt-2 text-xl font-black tracking-tight text-slate-900">{receipt.business?.name || "Nexora"}</h2>
          {receipt.business?.address ? <p className="mt-1 text-xs text-slate-600">{receipt.business.address}</p> : null}
          {receipt.business?.contact ? <p className="text-xs text-slate-600">{receipt.business.contact}</p> : null}
          <p className="text-xs font-medium uppercase tracking-widest text-slate-500">
            In-store receipt / Invoice
          </p>
        </div>

        <div className="border-b border-dashed border-slate-300 py-4 text-center">
          <p className="text-2xl font-black tracking-wide text-slate-900">{receipt.orderNumber}</p>
          <p className="mt-1 text-sm text-slate-600">{formatDateTime(receipt.createdAt)}</p>
          <div className="mt-2 flex items-center justify-center gap-2 print:hidden">
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

        {(receipt.customerName || receipt.customerEmail || receipt.customerPhone || receipt.staffName) ? (
          <div className="border-b border-dashed border-slate-300 py-4 text-sm text-slate-700 space-y-1">
            {receipt.customerName ? (
              <p>
                <span className="font-semibold">Customer:</span> {receipt.customerName}
                {receipt.customerPhone ? ` · ${receipt.customerPhone}` : ""}
                {receipt.customerEmail ? ` · ${receipt.customerEmail}` : ""}
              </p>
            ) : null}
            {receipt.staffName ? (
              <p>
                <span className="font-semibold">Billed by:</span> {receipt.staffName}
              </p>
            ) : null}
          </div>
        ) : null}

        <ul className="divide-y divide-slate-100">
          {receipt.items.map((item) => (
            <li key={item.productId} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{item.productName}</p>
                <p className="text-xs text-slate-500">
                  {item.sku} × {item.quantity} {item.unit || "Piece"}
                  {item.taxRate && item.taxRate > 0 ? ` (GST ${item.taxRate}%)` : ""}
                </p>
              </div>
              <div className="text-right">
                <Price amountInPaise={item.lineTotalInPaise} className="text-sm font-bold text-slate-900" />
                <p className="text-xs text-slate-400">{formatMoney(item.unitPriceInPaise)} each</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="space-y-1.5 border-t border-dashed border-slate-300 pt-4">
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>Subtotal ({receipt.itemCount} {receipt.itemCount === 1 ? "item" : "items"})</span>
            <Price amountInPaise={receipt.subtotalInPaise} className="font-semibold text-slate-900" />
          </div>

          {receipt.taxInPaise > 0 ? (
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>Taxes (GST)</span>
              <span className="font-semibold text-slate-900">{formatMoney(receipt.taxInPaise)}</span>
            </div>
          ) : null}

          {receipt.discountInPaise > 0 ? (
            <div className="flex items-center justify-between text-sm text-emerald-700">
              <span>Discount</span>
              <span className="font-semibold">-{formatMoney(receipt.discountInPaise)}</span>
            </div>
          ) : null}

          <div className="flex items-center justify-between border-t border-slate-200 pt-1.5">
            <span className="text-base font-bold text-slate-900">Total</span>
            <span className="text-xl font-black text-slate-900">
              {formatMoney(receipt.totalInPaise)}
            </span>
          </div>

          {/* Cash payment breakdown */}
          {receipt.paymentMethod === PAYMENT_METHOD.CASH && receipt.amountPaidInPaise > 0 ? (
            <>
              <div className="flex items-center justify-between text-sm text-slate-600">
                <span>Cash received</span>
                <span className="font-semibold text-slate-900">
                  {formatMoney(receipt.amountPaidInPaise + receipt.changeInPaise)}
                </span>
              </div>
              {showChange ? (
                <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2">
                  <span className="text-sm font-semibold text-emerald-800">Change returned</span>
                  <span className="text-base font-black text-emerald-900">{formatMoney(receipt.changeInPaise)}</span>
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>Amount Paid</span>
              <span className="font-semibold text-slate-900">{formatMoney(receipt.amountPaidInPaise)}</span>
            </div>
          )}

          {hasDues ? (
            <div className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <span className="font-semibold">Balance Due</span>
              <span className="font-bold text-amber-900">{formatMoney(receipt.outstandingDueInPaise)}</span>
            </div>
          ) : null}

          <p className="pt-2 text-xs text-slate-500">
            {isPendingVerification
              ? `Payment via ${receipt.paymentMethodLabel} — pending verification. Thank you for shopping with Nexora.`
              : `Paid via ${receipt.paymentMethodLabel}. Thank you for shopping with Nexora.`}
          </p>
        </div>

        <div className="mt-6 space-y-3 print:hidden">
          <label className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-700">
            Paper size
            <select value={paper} onChange={(event) => setPaper(event.target.value as typeof paper)} className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm">
              <option value="58mm">58mm thermal</option>
              <option value="80mm">80mm thermal</option>
              <option value="a4">A4</option>
            </select>
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="secondary"
            size="lg"
            className="flex-1"
            onClick={() => window.print()}
          >
            Print Bill
          </Button>
          <a
            href={`/api/pos/orders/${encodeURIComponent(receipt.orderNumber)}/receipt?format=pdf`}
            download
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Download PDF
          </a>
          <Button size="lg" className="flex-1" onClick={onNewSale ?? onClose}>
            {onNewSale ? "New sale" : "Close"}
          </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
