"use client";

import { useEffect, useState } from "react";

import { getJson } from "@/components/pos/api";
import { POS_PAYMENT_METHODS, PAYMENT_METHOD_LABELS, PAYMENT_METHOD_DESCRIPTIONS, PAYMENT_METHOD } from "@/lib/constants/order";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Price } from "@/components/ui/Price";
import { TextField } from "@/components/ui/TextField";
import { cn } from "@/lib/utils/cn";
import { formatMoney } from "@/lib/utils/money";
import type { PaymentMethod } from "@/lib/constants/order";
import type { PosCartLine, PosSplitPaymentInput } from "@/types/pos";

export interface ChargeState {
  label: string | null;
  submitting: boolean;
  disabled: boolean;
}

export interface CustomerOption {
  id: string;
  name: string;
  phone: string;
  email: string;
  outstandingDueInPaise: number;
}

export function CartPanel({
  lines,
  itemCount,
  subtotalInPaise,
  taxInPaise,
  discountInPaise,
  totalInPaise,
  customerName,
  customerEmail,
  customerPhone,
  selectedCustomer,
  paymentMethod,
  splitPayments,
  cashReceivedInPaise,
  referenceNumber,
  paymentNotes,
  submitting,
  errorMessage,
  chargeLabel,
  onCustomerNameChange,
  onCustomerEmailChange,
  onCustomerPhoneChange,
  onSelectCustomer,
  onDiscountChange,
  onPaymentMethodChange,
  onSplitPaymentsChange,
  onCashReceivedChange,
  onReferenceNumberChange,
  onPaymentNotesChange,
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
  taxInPaise: number;
  discountInPaise: number;
  totalInPaise: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  selectedCustomer: CustomerOption | null;
  paymentMethod: PaymentMethod;
  splitPayments: PosSplitPaymentInput[];
  cashReceivedInPaise: number;
  referenceNumber: string;
  paymentNotes: string;
  submitting: boolean;
  errorMessage: string | null;
  chargeLabel: string;
  onCustomerNameChange: (value: string) => void;
  onCustomerEmailChange: (value: string) => void;
  onCustomerPhoneChange: (value: string) => void;
  onSelectCustomer: (customer: CustomerOption | null) => void;
  onDiscountChange: (value: number) => void;
  onPaymentMethodChange: (value: PaymentMethod) => void;
  onSplitPaymentsChange: (splits: PosSplitPaymentInput[]) => void;
  onCashReceivedChange: (value: number) => void;
  onReferenceNumberChange: (value: string) => void;
  onPaymentNotesChange: (value: string) => void;
  onIncrease: (productId: string) => void;
  onDecrease: (productId: string) => void;
  onSetQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
  onClear: () => void;
  onCharge: () => void;
  onClose: () => void;
}) {
  const empty = lines.length === 0;
  const isCash = paymentMethod === PAYMENT_METHOD.CASH;
  const isSplit = paymentMethod === PAYMENT_METHOD.SPLIT;
  const needsReference = [
    PAYMENT_METHOD.UPI,
    PAYMENT_METHOD.BANK_TRANSFER,
    PAYMENT_METHOD.CHEQUE,
    PAYMENT_METHOD.CARD,
  ].includes(paymentMethod as typeof PAYMENT_METHOD.UPI);

  // Customer search state
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [customerSuggestions, setCustomerSuggestions] = useState<CustomerOption[]>([]);
  const [searchingCustomers, setSearchingCustomers] = useState(false);
  const hasCustomerSearch = customerSearchQuery.trim().length >= 2;
  const visibleCustomerSuggestions = hasCustomerSearch ? customerSuggestions : [];

  useEffect(() => {
    if (!hasCustomerSearch) return;

    const timer = setTimeout(async () => {
      setSearchingCustomers(true);
      const res = await getJson<CustomerOption[]>(
        `/api/pos/customers/search?q=${encodeURIComponent(customerSearchQuery.trim())}`,
      );
      setSearchingCustomers(false);
      if (res.ok && res.data) {
        setCustomerSuggestions(res.data);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [customerSearchQuery, hasCustomerSearch]);

  // Cash change calculation
  const changeInPaise =
    isCash && cashReceivedInPaise >= totalInPaise
      ? cashReceivedInPaise - totalInPaise
      : 0;
  const cashShort =
    isCash && cashReceivedInPaise > 0 && cashReceivedInPaise < totalInPaise;

  // Split payment totals
  const splitTotal = splitPayments.reduce((s, p) => s + p.amountInPaise, 0);
  const splitRemaining = totalInPaise - splitTotal;

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
            Tap products or scan barcodes to start the sale.
          </p>
        ) : (
          lines.map((line) => (
            <div
              key={line.productId}
              className="flex items-start gap-3 rounded-lg border border-slate-200 p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">{line.name}</p>
                <p className="text-xs text-slate-500">
                  SKU {line.sku} {line.taxRate ? `· GST ${line.taxRate}%` : ""}
                </p>
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
                      line.maxQuantity !== null && line.quantity >= line.maxQuantity && "cursor-not-allowed text-slate-300",
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
          {/* Subtotal, Taxes, Discount breakdown */}
          <div className="space-y-1 text-sm">
            <div className="flex items-center justify-between text-slate-600">
              <span>Subtotal</span>
              <Price amountInPaise={subtotalInPaise} className="font-semibold text-slate-900" />
            </div>

            {taxInPaise > 0 ? (
              <div className="flex items-center justify-between text-slate-600">
                <span>Taxes (GST)</span>
                <Price amountInPaise={taxInPaise} className="font-semibold text-slate-900" />
              </div>
            ) : null}

            {discountInPaise > 0 ? (
              <div className="flex items-center justify-between text-emerald-700">
                <span>Discount applied</span>
                <span className="font-semibold">-{formatMoney(discountInPaise)}</span>
              </div>
            ) : null}
          </div>

          {/* Discount input */}
          <div className="flex items-center gap-2">
            <label htmlFor="pos-discount" className="text-xs font-semibold text-slate-600 shrink-0">
              Discount (₹):
            </label>
            <input
              id="pos-discount"
              type="number"
              min={0}
              placeholder="0.00"
              value={discountInPaise ? (discountInPaise / 100).toString() : ""}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                onDiscountChange(Number.isNaN(val) ? 0 : Math.round(val * 100));
              }}
              className="h-8 w-28 rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-900 focus:border-slate-900 focus:ring-0"
              disabled={submitting}
            />
          </div>

          {/* Payment method selection */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Payment method
            </p>
            <div className="grid grid-cols-2 gap-2">
              {POS_PAYMENT_METHODS.map((method) => (
                <label
                  key={method}
                  title={PAYMENT_METHOD_DESCRIPTIONS[method]}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
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
          </div>

          {/* Split Payment inputs */}
          {isSplit ? (
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                <span>Split payments allocation</span>
                <span>Remaining: {formatMoney(Math.max(0, splitRemaining))}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-slate-600">Cash split (₹)</label>
                  <input
                    type="number"
                    min={0}
                    placeholder="0.00"
                    value={
                      splitPayments.find((p) => p.paymentMethod === "CASH")?.amountInPaise
                        ? (splitPayments.find((p) => p.paymentMethod === "CASH")!.amountInPaise / 100).toString()
                        : ""
                    }
                    onChange={(e) => {
                      const amount = Math.round((parseFloat(e.target.value) || 0) * 100);
                      const others = splitPayments.filter((p) => p.paymentMethod !== "CASH");
                      if (amount > 0) {
                        onSplitPaymentsChange([...others, { paymentMethod: PAYMENT_METHOD.CASH, amountInPaise: amount }]);
                      } else {
                        onSplitPaymentsChange(others);
                      }
                    }}
                    className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-900"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">UPI / Card split (₹)</label>
                  <input
                    type="number"
                    min={0}
                    placeholder="0.00"
                    value={
                      splitPayments.find((p) => p.paymentMethod === "UPI")?.amountInPaise
                        ? (splitPayments.find((p) => p.paymentMethod === "UPI")!.amountInPaise / 100).toString()
                        : ""
                    }
                    onChange={(e) => {
                      const amount = Math.round((parseFloat(e.target.value) || 0) * 100);
                      const others = splitPayments.filter((p) => p.paymentMethod !== "UPI");
                      if (amount > 0) {
                        onSplitPaymentsChange([...others, { paymentMethod: PAYMENT_METHOD.UPI, amountInPaise: amount }]);
                      } else {
                        onSplitPaymentsChange(others);
                      }
                    }}
                    className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-900"
                  />
                </div>
              </div>
            </div>
          ) : null}

          {/* Cash received + change calculator */}
          {isCash ? (
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div>
                <label htmlFor="cash-received" className="text-xs font-semibold text-slate-700">
                  Cash received (₹)
                </label>
                <input
                  id="cash-received"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  placeholder="Leave empty if exact cash"
                  value={cashReceivedInPaise > 0 ? (cashReceivedInPaise / 100).toString() : ""}
                  onChange={(event) => {
                    const value = event.target.value.trim();
                    if (value === "") onCashReceivedChange(0);
                    else {
                      const parsed = parseFloat(value);
                      if (!Number.isNaN(parsed) && parsed >= 0) {
                        onCashReceivedChange(Math.round(parsed * 100));
                      }
                    }
                  }}
                  disabled={submitting}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:border-slate-900 focus:ring-0"
                />
              </div>
              {cashShort ? (
                <div className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <span>Partial payment (due):</span>
                  <span className="font-bold">₹{((totalInPaise - cashReceivedInPaise) / 100).toFixed(2)} balance</span>
                </div>
              ) : cashReceivedInPaise >= totalInPaise && changeInPaise > 0 ? (
                <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2">
                  <span className="text-xs font-semibold text-emerald-800">Change to return</span>
                  <span className="text-sm font-black text-emerald-900">
                    {formatMoney(changeInPaise)}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Reference number for UPI/Card/Bank/Cheque */}
          {needsReference ? (
            <TextField
              label={
                paymentMethod === PAYMENT_METHOD.UPI
                  ? "UPI Transaction ID"
                  : paymentMethod === PAYMENT_METHOD.BANK_TRANSFER
                  ? "Bank Transfer Reference"
                  : paymentMethod === PAYMENT_METHOD.CHEQUE
                  ? "Cheque Number"
                  : "Card / Terminal Reference"
              }
              name="pos-reference-number"
              optional={paymentMethod === PAYMENT_METHOD.CARD || paymentMethod === PAYMENT_METHOD.MOBILE}
              placeholder="Enter reference / transaction ID"
              autoComplete="off"
              value={referenceNumber}
              disabled={submitting}
              onChange={(event) => onReferenceNumberChange(event.target.value)}
            />
          ) : null}

          {/* Customer info & Search */}
          <div className="relative">
            {selectedCustomer ? (
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs">
                <div>
                  <p className="font-semibold text-slate-900">{selectedCustomer.name}</p>
                  <p className="text-slate-500">{selectedCustomer.phone || selectedCustomer.email}</p>
                  {selectedCustomer.outstandingDueInPaise > 0 ? (
                    <p className="font-semibold text-amber-700">
                      Existing Dues: {formatMoney(selectedCustomer.outstandingDueInPaise)}
                    </p>
                  ) : null}
                </div>
                <Button variant="ghost" size="sm" onClick={() => onSelectCustomer(null)}>
                  Clear
                </Button>
              </div>
            ) : (
              <>
                <TextField
                  label="Customer search or walk-in"
                  name="pos-customer-search"
                  optional
                  placeholder="Search customer by phone/name, or walk-in"
                  autoComplete="off"
                  value={customerSearchQuery || customerName}
                  disabled={submitting}
                  onChange={(event) => {
                    setCustomerSearchQuery(event.target.value);
                    onCustomerNameChange(event.target.value);
                  }}
                />
                {visibleCustomerSuggestions.length > 0 ? (
                  <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                    {visibleCustomerSuggestions.map((c) => (
                      <li
                        key={c.id}
                        onClick={() => {
                          onSelectCustomer(c);
                          onCustomerNameChange(c.name);
                          onCustomerEmailChange(c.email);
                          onCustomerPhoneChange(c.phone);
                          setCustomerSearchQuery("");
                          setCustomerSuggestions([]);
                        }}
                        className="cursor-pointer border-b border-slate-100 p-2 text-xs hover:bg-slate-50"
                      >
                        <p className="font-semibold text-slate-900">{c.name}</p>
                        <p className="text-slate-500">{c.phone} · {c.email}</p>
                        {c.outstandingDueInPaise > 0 ? (
                          <p className="font-semibold text-amber-700">
                            Due: {formatMoney(c.outstandingDueInPaise)}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </div>

          {errorMessage ? (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
              {errorMessage}
            </p>
          ) : null}

          <div className="flex items-center justify-between">
            <span className="text-base font-semibold text-slate-900">Total</span>
            <span className="text-xl font-bold text-slate-900">
              {formatMoney(totalInPaise)}
            </span>
          </div>

          <Button
            size="lg"
            fullWidth
            disabled={submitting || empty || (isSplit && splitRemaining !== 0)}
            onClick={onCharge}
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <span className={cn("h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-white")} />
                Processing…
              </span>
            ) : (
              chargeLabel
            )}
          </Button>
          <p className="text-center text-xs text-slate-400">
            Complete the sale to record payment as <Badge tone="success">
              {paymentMethod === PAYMENT_METHOD.BANK_TRANSFER || paymentMethod === PAYMENT_METHOD.CHEQUE
                ? "Pending Verification"
                : "Paid"}
            </Badge>.
          </p>
        </div>
      </div>
    </div>
  );
}
