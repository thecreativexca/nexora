import type { Metadata } from "next";

import { CheckoutView } from "@/components/checkout/CheckoutView";
import { getCurrentCustomer } from "@/lib/auth/customer-session";

export const metadata: Metadata = {
  title: "Checkout",
  description:
    "Complete your Nexora order securely with PayPal as a guest or while signed in.",
  robots: { index: false },
};

export default async function CheckoutPage() {
  const customer = await getCurrentCustomer();

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Checkout</h1>
        <p className="mt-1 text-sm text-slate-600">
          {customer
            ? "Your details are prefilled - review them and pay securely with PayPal."
            : "Guest checkout - no account required. Pay securely with PayPal."}
        </p>
      </header>
      <CheckoutView customer={customer} paypalClientId={process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? ""} currency={(process.env.PAYPAL_CURRENCY ?? "INR").toUpperCase()} />
    </div>
  );
}
