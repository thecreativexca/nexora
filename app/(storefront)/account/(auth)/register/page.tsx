import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { RegisterForm } from "@/components/account/RegisterForm";
import { getCurrentCustomer } from "@/lib/auth/customer-session";

export const metadata: Metadata = {
  title: "Create account",
  description: "Create a Nexora account to track your orders and check out faster.",
  robots: { index: false, follow: false },
};

/** Only relative in-app paths are honoured (prevents open redirects). */
function safeNext(value: string | string[] | undefined): string {
  const next = Array.isArray(value) ? value[0] : value;
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/account";
  return next;
}

export default async function RegisterPage({ searchParams }: PageProps<"/account/register">) {
  const customer = await getCurrentCustomer();
  if (customer) redirect("/account");

  const params = await searchParams;

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Create your account</h1>
        <p className="mt-1 text-sm text-slate-600">
          It only takes a minute. Guest checkout is always available if you prefer.
        </p>
      </header>
      <RegisterForm next={safeNext(params.next)} />
    </>
  );
}
