"use client";

import { Price } from "@/components/ui/Price";
import { PAYMENT_METHOD_LABELS, PAYMENT_METHOD } from "@/lib/constants/order";

/** Order totals block. All amounts are integer paise, computed server-side. */
export function CartSummary({
  subtotalInPaise,
  itemCount,
  blockingMessage,
}: {
  subtotalInPaise: number;
  itemCount: number;
  blockingMessage?: string | null;
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
          {PAYMENT_METHOD_LABELS[PAYMENT_METHOD.PAYPAL]}
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
