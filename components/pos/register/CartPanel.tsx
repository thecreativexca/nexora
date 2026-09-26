"use client";

import { POS_PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/constants/order";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Price } from "@/components/ui/Price";
import { TextField } from "@/components/ui/TextField";
import { cn } from "@/lib/utils/cn";
import { formatMoney } from "@/lib/utils/money";
import type { PaymentMethod } from "@/lib/constants/order";
import type { PosCartLine } from "@/types/pos";

export interface ChargeState {
  label: string | null;
  submitting: boolean;
  disabled: boolean;
}

export function CartPanel({
  lines,
  itemCount,
  subtotalInPaise,
  customerName,
  customerEmail,
  paymentMethod,
  submitting,
  errorMessage,
  chargeLabel,
  onCustomerNameChange,
  onCustomerEmailChange,
  onPaymentMethodChange,
  onIncrease,
  onDecrease,
  onSetQuantity,
  onRemove,
  onClear,
  onCharge,
  onClose,
}: {
  lines: PosCartLine[];
  itemCount: number;
  subtotalInPaise: number;
  customerName: string;
  customerEmail: string;
  paymentMethod: PaymentMethod;
  submitting: boolean;
  errorMessage: string | null;
  chargeLabel: string;
  onCustomerNameChange: (value: string) => void;
  onCustomerEmailChange: (value: string) => void;
  onPaymentMethodChange: (value: PaymentMethod) => void;
  onIncrease: (productId: string) => void;
  onDecrease: (productId: string) => void;
  onSetQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
  onClear: () => void;
  onCharge: () => void;
  onClose: () => void;
}) {
  const empty = lines.length === 0;

  return (
    <div className="flex h-full max-h-[100dvh] flex-col rounded-xl border border-slate-200 bg-white lg:max-h-none lg:border-0 lg:bg-transparent">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-900">
          Current sale
          {itemCount > 0 ? (
            <span className="ml-2 rounded-full bg-slate-900 px-2 py-0.5 text-xs font-bold text-white">
              {itemCount}
            </span>
          ) : null}
        </h2>
        <div className="flex items-center gap-2">
          {!empty ? (
            <Button variant="ghost" size="sm" onClick={onClear} disabled={submitting}>
              Clear
            </Button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close cart"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {empty ? (
          <p className="py-10 text-center text-sm text-slate-500">
            Tap products on the left to start the sale.
          </p>
        ) : (
          lines.map((line) => (
            <div
              key={line.productId}
              className="flex items-start gap-3 rounded-lg border border-slate-200 p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">{line.name}</p>
                <p className="text-xs text-slate-500">SKU {line.sku}</p>
                <Price amountInPaise={line.unitPriceInPaise} className="mt-1 text-sm font-bold text-slate-900" />
              </div>

              <div className="flex flex-col items-end gap-1.5">
                <div className="flex items-center rounded-lg border border-slate-200">
                  <button
                    type="button"
                    aria-label={`Decrease ${line.name} quantity`}
                    className="flex h-8 w-8 items-center justify-center rounded-l-lg text-slate-600 hover:bg-slate-100 disabled:text-slate-300"
                    disabled={submitting || line.quantity <= 1}
                    onClick={() => onDecrease(line.productId)}
                  >
                    −
                  </button>
                  <input
                    aria-label={`${line.name} quantity`}
                    inputMode="numeric"
                    className="h-8 w-10 border-x border-slate-200 bg-white text-center text-sm font-semibold text-slate-900"
                    value={line.quantity}
                    min={1}
                    max={line.maxQuantity ?? undefined}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      if (Number.isFinite(next)) onSetQuantity(line.productId, next);
                    }}
                  />
                  <button
                    type="button"
                    aria-label={`Increase ${line.name} quantity`}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-r-lg text-slate-600 hover:bg-slate-100",
                      (line.maxQuantity !== null && line.quantity >= line.maxQuantity) && "cursor-not-allowed text-slate-300",
                    )}
                    disabled={submitting || (line.maxQuantity !== null && line.quantity >= line.maxQuantity)}
                    onClick={() => onIncrease(line.productId)}
                  >
                    +
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <Price
                    amountInPaise={line.unitPriceInPaise * line.quantity}
                    className="text-xs font-bold text-slate-700"
                  />
                  <button
                    type="button"
                    aria-label={`Remove ${line.name}`}
                    className="text-xs font-medium text-rose-600 hover:text-rose-500"
                    disabled={submitting}
                    onClick={() => onRemove(line.productId)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-slate-200 px-4 py-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">Subtotal</span>
            <Price amountInPaise={subtotalInPaise} className="text-sm font-bold text-slate-900" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            {POS_PAYMENT_METHODS.map((method) => (
              <label
                key={method}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium",
                  paymentMethod === method
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
                )}
              >
                <input
                  type="radio"
                  name="payment-method"
                  value={method}
                  checked={paymentMethod === method}
                  onChange={() => onPaymentMethodChange(method)}
                  disabled={submitting}
                  className="sr-only"
                />
                {PAYMENT_METHOD_LABELS[method]}
              </label>
            ))}
          </div>

          <TextField
            label="Customer name"
            name="pos-customer-name"
            optional
            placeholder="Walk-in customer"
            autoComplete="off"
            value={customerName}
            disabled={submitting}
            onChange={(event) => onCustomerNameChange(event.target.value)}
          />
          <TextField
            type="email"
            label="Customer email"
            name="pos-customer-email"
            optional
            placeholder="For a digital receipt"
            autoComplete="off"
            value={customerEmail}
            disabled={submitting}
            onChange={(event) => onCustomerEmailChange(event.target.value)}
          />

          {errorMessage ? (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
              {errorMessage}
            </p>
          ) : null}

          <div className="flex items-center justify-between">
            <span className="text-base font-semibold text-slate-900">Total</span>
            <span className="text-xl font-bold text-slate-900">
              {formatMoney(subtotalInPaise)}
            </span>
          </div>

          <Button
            size="lg"
            fullWidth
            disabled={submitting || empty}
            onClick={onCharge}
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <span className={cn("h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-white")} />
                Charging…
              </span>
            ) : (
              chargeLabel
            )}
          </Button>
          <p className="text-center text-xs text-slate-400">
            Complete the sale to mark it as <Badge tone="success">Paid</Badge>.
          </p>
        </div>
      </div>
    </div>
  );
}