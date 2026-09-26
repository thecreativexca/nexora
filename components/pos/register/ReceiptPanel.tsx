"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Price } from "@/components/ui/Price";
import { formatDateTime } from "@/lib/utils/format";
import { formatMoney } from "@/lib/utils/money";
import type { PosReceipt } from "@/types/pos";

export function ReceiptPanel({
  receipt,
  onNewSale,
}: {
  receipt: PosReceipt;
  onNewSale: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true" aria-label="Sale receipt">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="border-b border-dashed border-slate-300 pb-4 text-center">
          <h2 className="text-xl font-black tracking-tight text-slate-900">Nexora</h2>
          <p className="text-xs font-medium uppercase tracking-widest text-slate-500">
            In-store receipt
          </p>
        </div>

        <div className="border-b border-dashed border-slate-300 py-4 text-center">
          <p className="text-2xl font-black tracking-wide text-slate-900">{receipt.orderNumber}</p>
          <p className="mt-1 text-sm text-slate-600">{formatDateTime(receipt.createdAt)}</p>
          <div className="mt-2 flex items-center justify-center gap-2">
            <Badge tone="success">{receipt.statusLabel}</Badge>
            <Badge tone="success">{receipt.paymentMethodLabel} · {receipt.paymentStatusLabel}</Badge>
          </div>
        </div>

        {(receipt.customerName || receipt.customerEmail || receipt.staffName) ? (
          <div className="border-b border-dashed border-slate-300 py-4 text-sm text-slate-700">
            {receipt.customerName ? (
              <p>
                <span className="font-semibold">Customer:</span> {receipt.customerName}
                {receipt.customerEmail ? ` · ${receipt.customerEmail}` : ""}
              </p>
            ) : null}
            {receipt.staffName ? (
              <p>
                <span className="font-semibold">Served by:</span> {receipt.staffName}
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
                  {item.sku} × {item.quantity}
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
          <div className="flex items-center justify-between">
            <span className="text-base font-bold text-slate-900">Total</span>
            <span className="text-xl font-black text-slate-900">
              {formatMoney(receipt.totalInPaise)}
            </span>
          </div>
          <p className="pt-2 text-xs text-slate-500">
            Paid via {receipt.paymentMethodLabel}. Thank you for shopping with Nexora.
          </p>
        </div>

        <Button fullWidth size="lg" className="mt-6" onClick={onNewSale}>
          New sale
        </Button>
      </div>
    </div>
  );
}