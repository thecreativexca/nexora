"use client";

import { Price } from "@/components/ui/Price";

/** Order totals block. All amounts are integer paise, computed server-side. */
export function CartSummary({
  subtotalInPaise,
  itemCount,
  blockingMessage,
  paymentLabel = "Offline payment",
}: {
  subtotalInPaise: number;
  itemCount: number;
  blockingMessage?: string | null;
  paymentLabel?: string;
}) {
  return (
    <dl className="space-y-2 text-sm">
      <div className="flex items-center justify-between">
        <dt className="text-slate-600">
          Items ({itemCount} {itemCount === 1 ? "unit" : "units"})
        </dt>
        <dd className="font-semibold text-slate-900">
          <Price amountInPaise={subtotalInPaise} />
        </dd>
      </div>
      <div className="flex items-center justify-between">
        <dt className="text-slate-600">Delivery &amp; taxes</dt>
        <dd className="font-medium text-slate-700">Included</dd>
      </div>
      <div className="flex items-center justify-between">
        <dt className="text-slate-600">Payment</dt>
        <dd className="font-medium text-slate-700">
          {paymentLabel}
        </dd>
      </div>
      <div className="flex items-center justify-between border-t border-slate-200 pt-3 text-base">
        <dt className="font-semibold text-slate-900">Total</dt>
        <dd className="font-bold text-slate-900">
          <Price amountInPaise={subtotalInPaise} />
        </dd>
      </div>
      {blockingMessage ? (
        <p className="text-xs font-medium text-rose-600">{blockingMessage}</p>
      ) : null}
    </dl>
  );
}
