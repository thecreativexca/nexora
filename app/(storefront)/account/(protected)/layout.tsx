import type { ReactNode } from "react";

import { AccountTabs } from "@/components/account/AccountTabs";
import { LogoutButton } from "@/components/account/LogoutButton";
import { requireCustomer } from "@/lib/auth/customer-session";

/**
 * Server-side gate for every `/account/*` page. Unauthenticated visitors are
 * redirected before any customer data is fetched or rendered.
 */
export default async function AccountProtectedLayout({ children }: { children: ReactNode }) {
  const customer = await requireCustomer("/account");

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Your account</h1>
          <p className="mt-1 truncate text-sm text-slate-600">Signed in as {customer.email}</p>
        </div>
        <LogoutButton />
      </header>

      <AccountTabs />

      <div className="mt-6">{children}</div>
    </div>
  );
}
