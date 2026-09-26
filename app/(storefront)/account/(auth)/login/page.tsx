import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/account/LoginForm";
import { getCurrentCustomer } from "@/lib/auth/customer-session";

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

export default async function LoginPage({ searchParams }: PageProps<"/account/login">) {
  const customer = await getCurrentCustomer();
  if (customer) redirect("/account");

  const params = await searchParams;

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Welcome back</h1>
        <p className="mt-1 text-sm text-slate-600">
          Sign in to see your orders and check out without re-entering your details.
        </p>
      </header>
      {params.oauth ? <div role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Social sign-in was cancelled or could not be completed. Please try again or use email and password.</div> : null}
      <LoginForm next={safeNext(params.next)} />
    </>
  );
}
