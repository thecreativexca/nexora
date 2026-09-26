import Link from "next/link";

import { Badge } from "@/components/ui/Badge";
import { Price } from "@/components/ui/Price";
import { formatDate, pluralize } from "@/lib/utils/format";
import type { CustomerOrderSummary } from "@/types/order";

/** Compact, linkable order row used on the account dashboard. */
export function OrderCard({ order }: { order: CustomerOrderSummary }) {
  return (
    <Link
      href={`/account/orders/${order.orderNumber}`}
      className="block rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-slate-400 hover:bg-slate-50"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-sm font-bold text-slate-900">{order.orderNumber}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {formatDate(order.createdAt)} · {pluralize(order.itemCount, "item")}
          </p>
        </div>
        <Badge tone={order.statusTone}>{order.statusLabel}</Badge>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3 text-sm">
        <span className="text-slate-600">
          {order.paymentMethodLabel} · {order.paymentStatusLabel}
        </span>
        <Price amountInPaise={order.totalInPaise} className="font-semibold text-slate-900" />
      </div>
    </Link>
  );
}
