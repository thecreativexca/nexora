import Link from "next/link";

import { UserIcon } from "@/components/ui/icons";
import { getCurrentCustomer } from "@/lib/auth/customer-session";

/**
 * Header account entry point. Server-rendered so the label reflects the real
 * session; only the customer's first name is shown (never the email).
 */
export async function AccountMenuLink() {
  const customer = await getCurrentCustomer();
  const label = customer ? customer.name.trim().split(/\s+/)[0] || "Account" : "Sign in";
  const href = customer ? "/account" : "/account/login";

  return (
    <Link
      href={href}
      title={customer ? "View your account" : "Sign in to your account"}
      className="hidden h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 sm:inline-flex"
    >
      <UserIcon />
      <span className="max-w-[8rem] truncate">{label}</span>
    </Link>
  );
}
