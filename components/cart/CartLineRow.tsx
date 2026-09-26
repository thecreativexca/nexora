"use client";

import { ProductImage } from "@/components/common/ProductImage";
import { Price } from "@/components/ui/Price";
import { MinusIcon, PlusIcon, TrashIcon } from "@/components/ui/icons";
import { useCart } from "@/hooks/useCart";
import { MAX_LINE_QUANTITY } from "@/lib/constants/catalog";
import { formatMoney } from "@/lib/utils/money";
import type { CartLine, CartLineValidation } from "@/types/cart";

/**
 * One bag line with quantity controls.
 *
 * `validation` (when present) holds the live price/stock read from MongoDB, so
 * a stale saved bag shows the truth instead of a stale price.
 */
export function CartLineRow({
  line,
  validation,
}: {
  line: CartLine;
  validation?: CartLineValidation;
}) {
  const { increment, decrement, removeLine } = useCart();

  const unitPriceInPaise = validation?.unitPriceInPaise ?? line.unitPriceInPaise;
  const lineTotalInPaise = validation?.lineTotalInPaise ?? unitPriceInPaise * line.quantity;
  const maxQuantity = validation ? validation.maxQuantity : line.stockLimit;
  const canIncrease =
    maxQuantity === null
      ? line.quantity < MAX_LINE_QUANTITY
      : line.quantity < Math.min(maxQuantity, MAX_LINE_QUANTITY);
  const priceChanged = Boolean(
    validation && validation.unitPriceInPaise !== line.unitPriceInPaise,
  );

  return (
    <li className="flex gap-3 py-4">
      <div className="h-20 w-20 shrink-0">
        <ProductImage src={line.image} alt={line.name} sizes="80px" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-slate-900">
            {line.name}
            {line.isService ? (
              <span className="ml-1 text-xs font-medium text-emerald-700">Service</span>
            ) : null}
          </p>
          <button
            type="button"
            onClick={() => removeLine(line.productId)}
            aria-label={`Remove ${line.name} from bag`}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-0.5 text-xs text-slate-500">
          {formatMoney(unitPriceInPaise)} each
          {priceChanged ? (
            <span className="ml-1 font-medium text-amber-700">· price updated</span>
          ) : null}
        </p>

        {validation?.message ? (
          <p className="mt-1 text-xs font-medium text-amber-700">{validation.message}</p>
        ) : null}

        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="inline-flex items-center rounded-lg border border-slate-300">
            <button
              type="button"
              onClick={() => decrement(line.productId)}
              aria-label={`Decrease quantity of ${line.name}`}
              className="flex h-9 w-9 items-center justify-center rounded-l-lg text-slate-700 hover:bg-slate-100"
            >
              <MinusIcon className="h-4 w-4" />
            </button>
            <span aria-live="polite" className="w-9 text-center text-sm font-semibold tabular-nums">
              {line.quantity}
            </span>
            <button
              type="button"
              disabled={!canIncrease}
              onClick={() => increment(line.productId)}
              aria-label={`Increase quantity of ${line.name}`}
              className="flex h-9 w-9 items-center justify-center rounded-r-lg text-slate-700 hover:bg-slate-100 disabled:text-slate-300 disabled:hover:bg-transparent"
            >
              <PlusIcon className="h-4 w-4" />
            </button>
          </div>

          <Price amountInPaise={lineTotalInPaise} className="text-sm font-semibold text-slate-900" />
        </div>
      </div>
    </li>
  );
}
