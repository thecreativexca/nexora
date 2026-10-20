"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { CartSummary } from "@/components/cart/CartSummary";
import { EmptyState } from "@/components/common/EmptyState";
import { ProductImage } from "@/components/common/ProductImage";
import { buttonClasses } from "@/components/ui/Button";
import { Price } from "@/components/ui/Price";
import { Spinner } from "@/components/ui/Spinner";
import { TextField } from "@/components/ui/TextField";
import { AlertIcon } from "@/components/ui/icons";
import { useCart } from "@/hooks/useCart";
import { formatMoney } from "@/lib/utils/money";
import {
  PAYMENT_METHOD,
} from "@/lib/constants/order";
import { checkoutFieldSchemas, type CheckoutFieldName } from "@/lib/validations/common";
import type { CartLineValidation, CartValidation } from "@/types/cart";
import type { CustomerView } from "@/types/customer";
import { placeOrderAction } from "@/app/(storefront)/checkout/actions";

export interface CheckoutFormValues {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  notes: string;
}

const INITIAL_VALUES: CheckoutFormValues = {
  customerName: "",
  customerEmail: "",
  customerPhone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "India",
  notes: "",
};

/** Prefills the form from the signed-in customer, if any. Guests start blank. */
function buildInitialValues(customer: CustomerView | null): CheckoutFormValues {
  if (!customer) return INITIAL_VALUES;

  return {
    ...INITIAL_VALUES,
    customerName: customer.name,
    customerEmail: customer.email,
    customerPhone: customer.phone,
    addressLine1: customer.address?.line1 ?? "",
    addressLine2: customer.address?.line2 ?? "",
    city: customer.address?.city ?? "",
    state: customer.address?.state ?? "",
    postalCode: customer.address?.postalCode ?? "",
    country: customer.address?.country ?? INITIAL_VALUES.country,
  };
}

/** Flat form field -> Zod field schema (client-side UX checks only). */
const FIELD_SCHEMAS: Partial<Record<keyof CheckoutFormValues, CheckoutFieldName>> = {
  customerName: "customerName",
  customerEmail: "customerEmail",
  customerPhone: "customerPhone",
  addressLine1: "addressLine1",
  addressLine2: "addressLine2",
  city: "city",
  state: "state",
  postalCode: "postalCode",
  country: "country",
};

const FIELD_LABELS: Record<string, string> = {
  customerName: "Full name",
  customerEmail: "Email",
  customerPhone: "Phone",
  addressLine1: "Address line 1",
  addressLine2: "Address line 2",
  city: "City",
  state: "State / Region",
  postalCode: "Postal code",
  country: "Country",
  notes: "Order notes",
  form: "Order",
};

function validateClientSide(values: CheckoutFormValues): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const [field, schemaKey] of Object.entries(FIELD_SCHEMAS) as [
    keyof CheckoutFormValues,
    CheckoutFieldName,
  ][]) {
    const schema = checkoutFieldSchemas[schemaKey];
    const result = schema.safeParse(values[field] ?? "");
    if (!result.success) {
      errors[field] = result.error.issues[0]?.message ?? "Invalid value.";
    }
  }

  return errors;
}

export function CheckoutView({ customer }: { customer: CustomerView | null }) {
  const router = useRouter();
  const { lines, itemCount, hydrated, clearCart } = useCart();
  const [values, setValues] = useState<CheckoutFormValues>(() => buildInitialValues(customer));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validation, setValidation] = useState<CartValidation | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const paymentMethod = PAYMENT_METHOD.CASH;
  const linesRef = useRef(lines);
  const errorSummaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  const lineSignature = lines.map((line) => `${line.productId}:${line.quantity}`).join("|");

  /** Server re-check of prices + stock whenever the bag changes. */
  useEffect(() => {
    if (!hydrated) return;
    const current = linesRef.current;
    if (current.length === 0) {
      setValidation(null);
      return;
    }

    const controller = new AbortController();
    setIsValidating(true);
    fetch("/api/cart/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lines: current.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
        })),
      }),
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: CartValidation | null) => {
        if (data) setValidation(data);
      })
      .catch(() => {
        // Keep the last known state; checkout will re-validate on the server.
      })
      .finally(() => setIsValidating(false));

    return () => controller.abort();
  }, [hydrated, lineSignature]);

  const validationByProductId = new Map<string, CartLineValidation>(
    (validation?.lines ?? []).map((line) => [line.productId, line]),
  );
  const unavailableLines = (validation?.lines ?? []).filter((line) => !line.available);
  const subtotalInPaise =
    validation?.subtotalInPaise ??
    lines.reduce((total, line) => total + line.unitPriceInPaise * line.quantity, 0);

  const handleChange = (field: keyof CheckoutFormValues, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    const clientErrors = validateClientSide(values);
    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors);
      setFormError("Please correct the highlighted fields before placing the order.");
      errorSummaryRef.current?.focus();
      return;
    }

    setFieldErrors({});
    setFormError(null);

    if (unavailableLines.length > 0 || linesRef.current.length === 0) {
      setFormError("Please remove unavailable items before placing the order.");
      return;
    }

    setIsSubmitting(true);

    const payload = {
      customerName: values.customerName,
      customerEmail: values.customerEmail,
      customerPhone: values.customerPhone,
      address: {
        line1: values.addressLine1,
        line2: values.addressLine2,
        city: values.city,
        state: values.state,
        postalCode: values.postalCode,
        country: values.country,
      },
      notes: values.notes,
      paymentMethod,
      items: linesRef.current.map((line) => ({ productId: line.productId, quantity: line.quantity })),
    };

    try {
      const result = await placeOrderAction(payload);
      if (result.ok) {
        clearCart();
        router.push(`/order/${result.orderNumber}`);
      } else {
        setIsSubmitting(false);
        if (result.fieldErrors) {
          const flatErrors: Record<string, string> = {};
          for (const [key, messages] of Object.entries(result.fieldErrors)) {
            flatErrors[key] = messages[0] ?? "Invalid value.";
          }
          setFieldErrors(flatErrors);
        }
        setFormError(result.message);
        errorSummaryRef.current?.focus();
      }
    } catch {
      setIsSubmitting(false);
      setFormError("We could not place your order right now. Please try again.");
      errorSummaryRef.current?.focus();
    }
  };

  if (!hydrated) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        <Spinner label="Loading your bag" />
        Loading your bag...
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <EmptyState
        title="Your bag is empty"
        description="Add a product to your bag before checking out."
        action={
          <Link href="/products" className={buttonClasses("primary")}>
            Browse products
          </Link>
        }
      />
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-start">
      <form
        onSubmit={handleSubmit}
        noValidate
        className="space-y-6 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-lg shadow-slate-900/5 sm:p-6"
      >
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            {customer ? "Your details" : "Guest checkout"}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {customer
              ? `Signed in as ${customer.email}. This order will be saved to your account.`
              : "No account needed - we only ask for what is required to deliver your order."}
          </p>
          {!customer ? (
            <p className="mt-2 text-sm text-slate-600">
              <Link
                href="/account/login?next=%2Fcheckout"
                className="font-semibold text-slate-900 underline"
              >
                Sign in
              </Link>{" "}
              to save this order to your account and track it later.
            </p>
          ) : null}
        </div>

        {formError ? (
          <div
            ref={errorSummaryRef}
            tabIndex={-1}
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
          >
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">We could not place this order</p>
              <p className="mt-0.5">{formError}</p>
              {Object.keys(fieldErrors).length > 0 ? (
                <ul className="mt-2 list-disc space-y-0.5 pl-4">
                  {Object.entries(fieldErrors).map(([field, message]) => (
                    <li key={field}>
                      <a href={`#${field}`} className="underline">
                        {FIELD_LABELS[field] ?? "Field"}: {message}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        ) : null}

        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-slate-900">Contact details</legend>
          <TextField
            name="customerName"
            label="Full name"
            autoComplete="name"
            required
            value={values.customerName}
            error={fieldErrors.customerName}
            onChange={(event) => handleChange("customerName", event.target.value)}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              name="customerEmail"
              label="Email"
              type="email"
              autoComplete="email"
              required
              value={values.customerEmail}
              error={fieldErrors.customerEmail}
              hint="We send the order confirmation here."
              onChange={(event) => handleChange("customerEmail", event.target.value)}
            />
            <TextField
              name="customerPhone"
              label="Phone"
              type="tel"
              autoComplete="tel"
              required
              value={values.customerPhone}
              error={fieldErrors.customerPhone}
              hint="The delivery partner will call this number."
              onChange={(event) => handleChange("customerPhone", event.target.value)}
            />
          </div>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-slate-900">Delivery address</legend>
          <TextField
            name="addressLine1"
            label="Address line 1"
            autoComplete="address-line1"
            required
            value={values.addressLine1}
            error={fieldErrors.addressLine1}
            onChange={(event) => handleChange("addressLine1", event.target.value)}
          />
          <TextField
            name="addressLine2"
            label="Address line 2"
            optional
            autoComplete="address-line2"
            value={values.addressLine2}
            error={fieldErrors.addressLine2}
            onChange={(event) => handleChange("addressLine2", event.target.value)}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              name="city"
              label="City"
              autoComplete="address-level2"
              required
              value={values.city}
              error={fieldErrors.city}
              onChange={(event) => handleChange("city", event.target.value)}
            />
            <TextField
              name="state"
              label="State / Region"
              autoComplete="address-level1"
              required
              value={values.state}
              error={fieldErrors.state}
              onChange={(event) => handleChange("state", event.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              name="postalCode"
              label="Postal code"
              autoComplete="postal-code"
              required
              value={values.postalCode}
              error={fieldErrors.postalCode}
              onChange={(event) => handleChange("postalCode", event.target.value)}
            />
            <TextField
              name="country"
              label="Country"
              autoComplete="country-name"
              required
              value={values.country}
              error={fieldErrors.country}
              onChange={(event) => handleChange("country", event.target.value)}
            />
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-semibold text-slate-900">Order notes</legend>
          <label htmlFor="notes" className="sr-only">
            Order notes
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            value={values.notes}
            onChange={(event) => handleChange("notes", event.target.value)}
            placeholder="Delivery instructions, landmark or preferred time"
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400"
          />
          {fieldErrors.notes ? (
            <p className="mt-1 text-xs font-medium text-rose-600">{fieldErrors.notes}</p>
          ) : null}
        </fieldset>

        <section aria-labelledby="cod-payment" className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4 text-sm text-slate-700">
          <div className="flex items-start gap-3">
            <span aria-hidden className="text-2xl">💵</span>
            <div>
              <h2 id="cod-payment" className="font-bold text-indigo-950">Cash on Delivery</h2>
              <p className="mt-1 leading-6 text-slate-600">
                Pay in cash when your order is delivered. No card, UPI, bank transfer, or online payment is accepted on this checkout.
              </p>
              <p className="mt-2 text-xs font-semibold text-amber-800">Payment status: unpaid until collected by authorized staff</p>
            </div>
          </div>
        </section>

        <div className="flex flex-col gap-2">
          <button
            type="submit"
            disabled={isSubmitting || unavailableLines.length > 0 || lines.length === 0}
            className={buttonClasses("primary", "md")}
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Placing order…
              </span>
            ) : (
              `Place order · ${formatMoney(subtotalInPaise)}`
            )}
          </button>
          <Link href="/products" className={buttonClasses("secondary", "md")}>
            Continue shopping
          </Link>
        </div>
      </form>

      <aside className="space-y-4 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-lg shadow-slate-900/5 sm:p-6 lg:sticky lg:top-40">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-900">Order summary</h2>
          {isValidating ? <Spinner label="Checking availability" /> : null}
        </div>

        {unavailableLines.length > 0 ? (
          <div
            role="alert"
            className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"
          >
            <p className="font-semibold">Some items need attention</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {unavailableLines.map((line) => (
                <li key={line.productId}>
                  {line.name}: {line.message ?? "no longer available"}
                </li>
              ))}
            </ul>
            <p className="mt-2">We re-check every item when you place the order.</p>
          </div>
        ) : null}

        <ul className="divide-y divide-slate-100">
          {lines.map((line) => {
            const validated = validationByProductId.get(line.productId);
            const unitPriceInPaise = validated?.unitPriceInPaise ?? line.unitPriceInPaise;
            return (
              <li key={line.productId} className="flex items-center gap-3 py-3">
                <div className="h-14 w-14 shrink-0">
                  <ProductImage src={line.image} alt={line.name} sizes="56px" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{line.name}</p>
                  <p className="text-xs text-slate-500">
                    Qty {line.quantity} · {formatMoney(unitPriceInPaise)} each
                  </p>
                </div>
                <Price
                  amountInPaise={validated?.lineTotalInPaise ?? unitPriceInPaise * line.quantity}
                  className="text-sm font-semibold text-slate-900"
                />
              </li>
            );
          })}
        </ul>

        <CartSummary subtotalInPaise={subtotalInPaise} itemCount={itemCount} />
      </aside>
    </div>
  );
}
