"use client";

import { useEffect, useState } from "react";

import { getJson } from "@/components/pos/api";
import {
  POS_PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_DESCRIPTIONS,
  PAYMENT_METHOD,
} from "@/lib/constants/order";
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
  customerEmail: _customerEmail,
  customerPhone: _customerPhone,
  selectedCustomer,
  paymentMethod,
  splitPayments,
  cashReceivedInPaise,
  referenceNumber,
  paymentNotes: _paymentNotes,
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
  onPaymentNotesChange: _onPaymentNotesChange,
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
  const [_searchingCustomers, setSearchingCustomers] = useState(false);
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
    <div className="flex h-full max-h-[100dvh] min-h-0 flex-col rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900">
            Current Sale
          </h2>
          {itemCount > 0 ? (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-900 px-1.5 text-[11px] font-bold text-white">
              {itemCount}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          {!empty ? (
            <button
              type="button"
              onClick={onClear}
              disabled={submitting}
              className="rounded-lg px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 hover:text-rose-700 transition-colors disabled:opacity-50"
            >
              Clear
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close cart"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 lg:hidden"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Unified Scrollable Middle Content */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4 no-scrollbar">
        {/* Cart items list */}
        {empty ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <span className="text-3xl mb-2 opacity-40">🛒</span>
            <p className="text-sm font-semibold text-slate-700">Till is empty</p>
            <p className="text-xs text-slate-400 mt-1 max-w-[200px]">
              Tap products or scan barcode to add items to this sale.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {lines.map((line) => (
              <div
                key={line.productId}
                className="flex items-start gap-3 rounded-xl border border-slate-200/90 bg-white p-3 shadow-xs hover:border-slate-300 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-xs font-semibold text-slate-900 leading-snug">
                    {line.name}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    SKU {line.sku} {line.taxRate ? `· GST ${line.taxRate}%` : ""}
                  </p>
                  {line.brand || line.deviceModel || line.caseColor ? (
                    <p className="truncate text-[10px] font-medium text-indigo-600">
                      {[line.brand, line.deviceModel, line.caseColor].filter(Boolean).join(" · ")}
                    </p>
                  ) : null}
                  {line.quantity > 1 ? (
                    <p className="mt-1 text-[11px] text-slate-400">
                      {formatMoney(line.unitPriceInPaise)} each
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 shadow-xs">
                    <button
                      type="button"
                      aria-label={`Decrease ${line.name} quantity`}
                      className="flex h-7 w-7 items-center justify-center rounded-l-lg text-slate-600 hover:bg-white hover:text-slate-900 disabled:opacity-40 transition-colors"
                      disabled={submitting || line.quantity <= 1}
                      onClick={() => onDecrease(line.productId)}
                    >
                      −
                    </button>
                    <input
                      aria-label={`${line.name} quantity`}
                      inputMode="numeric"
                      className="h-7 w-8 border-x border-slate-200 bg-white text-center text-xs font-bold text-slate-900 focus:outline-none"
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
                        "flex h-7 w-7 items-center justify-center rounded-r-lg text-slate-600 hover:bg-white hover:text-slate-900 transition-colors",
                        line.maxQuantity !== null && line.quantity >= line.maxQuantity && "cursor-not-allowed opacity-40",
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
                      className="text-xs font-bold text-slate-900"
                    />
                    <button
                      type="button"
                      aria-label={`Remove ${line.name}`}
                      className="text-[11px] font-medium text-rose-600 hover:text-rose-700 hover:underline"
                      disabled={submitting}
                      onClick={() => onRemove(line.productId)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Payment Method Selector */}
        <div className="border-t border-slate-100 pt-3">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Payment Method
          </p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {POS_PAYMENT_METHODS.map((method) => {
              const active = paymentMethod === method;
              return (
                <button
                  key={method}
                  type="button"
                  suppressHydrationWarning
                  title={PAYMENT_METHOD_DESCRIPTIONS[method]}
                  onClick={() => onPaymentMethodChange(method)}
                  disabled={submitting}
                  className={cn(
                    "flex flex-col items-center justify-center rounded-xl border p-2 text-center transition-all",
                    active
                      ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
                  )}
                >
                  <span className="text-xs font-semibold">{PAYMENT_METHOD_LABELS[method]}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Cash payment specific inputs & quick denomination calculator */}
        {isCash ? (
          <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="cash-received" className="text-xs font-semibold text-slate-700">
                  Cash received (₹)
                </label>
                {totalInPaise > 0 ? (
                  <button
                    type="button"
                    suppressHydrationWarning
                    onClick={() => onCashReceivedChange(totalInPaise)}
                    className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800"
                  >
                    Exact: {formatMoney(totalInPaise)}
                  </button>
                ) : null}
              </div>
              <input
                id="cash-received"
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                suppressHydrationWarning
                placeholder="Enter cash given by customer"
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
                className="mt-1.5 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:ring-0"
              />
            </div>

            {/* Quick denominations */}
            {totalInPaise > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: "Exact", amount: totalInPaise },
                  { label: "+₹100", amount: totalInPaise + 10000 },
                  { label: "+₹500", amount: totalInPaise + 50000 },
                  { label: "+₹2000", amount: totalInPaise + 200000 },
                ].map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={() => onCashReceivedChange(chip.amount)}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-colors"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            ) : null}

            {cashShort ? (
              <div className="flex items-center justify-between rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
                <span>Partial payment:</span>
                <span className="font-bold">₹{((totalInPaise - cashReceivedInPaise) / 100).toFixed(2)} balance</span>
              </div>
            ) : cashReceivedInPaise >= totalInPaise && changeInPaise > 0 ? (
              <div className="flex items-center justify-between rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-2.5">
                <span className="text-xs font-bold text-emerald-800">Change to return</span>
                <span className="text-base font-black text-emerald-900">
                  {formatMoney(changeInPaise)}
                </span>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Reference number for UPI/Card/Bank/Cheque */}
        {needsReference ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
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
          </div>
        ) : null}

        {/* Split Payment inputs */}
        {isSplit ? (
          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
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
                  className="mt-1 h-8 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-900"
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
                  className="mt-1 h-8 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-900"
                />
              </div>
            </div>
          </div>
        ) : null}

        {/* Customer info & Search */}
        <div className="border-t border-slate-100 pt-3">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Customer Details
          </p>
          <div className="relative">
            {selectedCustomer ? (
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs">
                <div>
                  <p className="font-semibold text-slate-900">{selectedCustomer.name}</p>
                  <p className="text-slate-500">{selectedCustomer.phone || selectedCustomer.email}</p>
                  {selectedCustomer.outstandingDueInPaise > 0 ? (
                    <p className="font-semibold text-amber-700">
                      Existing Dues: {formatMoney(selectedCustomer.outstandingDueInPaise)}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => onSelectCustomer(null)}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800"
                >
                  Clear
                </button>
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
                  <ul className="absolute z-30 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl no-scrollbar">
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
                        className="cursor-pointer border-b border-slate-100 p-2.5 text-xs hover:bg-slate-50 transition-colors"
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
        </div>

        {/* Discount Field */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <label htmlFor="pos-discount" className="text-xs font-semibold text-slate-700">
            Discount (₹):
          </label>
          <input
            id="pos-discount"
            type="number"
            min={0}
            suppressHydrationWarning
            placeholder="0.00"
            value={discountInPaise ? (discountInPaise / 100).toString() : ""}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              onDiscountChange(Number.isNaN(val) ? 0 : Math.round(val * 100));
            }}
            className="h-8 w-28 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-900 text-right focus:border-slate-900 focus:ring-0"
            disabled={submitting}
          />
        </div>

        {errorMessage ? (
          <p role="alert" className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs font-medium text-rose-700">
            {errorMessage}
          </p>
        ) : null}
      </div>

      {/* Pinned Checkout Summary & Action Footer */}
      <div className="shrink-0 border-t border-slate-200 bg-slate-50/95 px-4 py-3.5 sm:px-5 space-y-3 backdrop-blur">
        <div className="space-y-1 text-xs">
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
              <span>Discount</span>
              <span className="font-semibold">-{formatMoney(discountInPaise)}</span>
            </div>
          ) : null}

          <div className="flex items-center justify-between border-t border-slate-200/80 pt-1.5 pb-0.5">
            <span className="text-sm font-bold text-slate-900">Total</span>
            <span className="text-lg font-black text-slate-900">
              {formatMoney(totalInPaise)}
            </span>
          </div>
        </div>

        <Button
          size="lg"
          fullWidth
          disabled={submitting || empty || (isSplit && splitRemaining !== 0)}
          onClick={onCharge}
          className="font-bold shadow-sm"
        >
          {submitting ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-white" />
              Processing sale…
            </span>
          ) : (
            chargeLabel
          )}
        </Button>

        <p className="text-center text-[11px] text-slate-400">
          Payment recorded as{" "}
          <Badge tone="success" className="text-[10px]">
            {paymentMethod === PAYMENT_METHOD.BANK_TRANSFER || paymentMethod === PAYMENT_METHOD.CHEQUE
              ? "Pending Verification"
              : "Paid"}
          </Badge>
        </p>
      </div>
    </div>
  );
}
