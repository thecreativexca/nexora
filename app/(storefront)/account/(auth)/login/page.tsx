import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/account/LoginForm";
import { getCurrentCustomer } from "@/lib/auth/customer-session";
import { getCurrentStaff } from "@/lib/auth/staff-session";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your Nexora account to track orders and check out faster.",
  robots: { index: false, follow: false },
};

/** Only relative in-app paths are honoured (prevents open redirects). */
function safeNext(value: string | string[] | undefined): string {
  const next = Array.isArray(value) ? value[0] : value;
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/account";
  return next;
}

/** Maps the OAuth callback's error code to a useful, non-technical message. */
function oauthErrorMessage(value: string | string[] | undefined): string | null {
  const code = Array.isArray(value) ? value[0] : value;
  if (!code) return null;

  switch (code) {
    case "cancelled":
      return "Google sign-in was cancelled. You can try again or use your email and password.";
    case "configuration":
      return process.env.NODE_ENV === "production"
        ? "Google sign-in is temporarily unavailable. Please use your email and password."
        : "Google sign-in is not configured yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local, then restart the dev server.";
    case "unsupported":
      return "That sign-in option is not available. Please use Google or your email and password.";
    default:
      return "We could not complete Google sign-in. Please try again or use your email and password.";
  }
}

export default async function LoginPage({ searchParams }: PageProps<"/account/login">) {
  const customer = await getCurrentCustomer();
  if (customer) redirect("/account");
  const staff = await getCurrentStaff();
  if (staff) redirect("/pos");

  const params = await searchParams;
  const oauthError = oauthErrorMessage(params.oauth);

  return (
    <>
      <header className="mb-6">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Customer &amp; staff access</p>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Welcome back</h1>
        <p className="mt-1 text-sm text-slate-600">
          Use one secure sign-in for shopping, management, or the POS register.
        </p>
      </header>
      {oauthError ? (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
        >
          {oauthError}
        </div>
      ) : null}
      <LoginForm next={safeNext(params.next)} />
    </>
  );
}
