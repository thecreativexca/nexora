import Link from "next/link";

import { getNavItems } from "@/components/pos/nav-items";
import { Badge } from "@/components/ui/Badge";
import {
  STAFF_ROLE,
  STAFF_ROLE_LABELS,
  staffRoleRequiresMfa,
} from "@/lib/constants/staff";
import type { StaffView } from "@/types/staff";

/** Portal landing page: overview of who you are and where you can go. */
export function DashboardView({ staff }: { staff: StaffView }) {
  const navItems = getNavItems(staff.role).filter((item) => item.href !== "/pos");

  const mfaLabel = staffRoleRequiresMfa(staff.role)
    ? staff.mfaEnabled
      ? "On — you are fully enrolled"
      : "Required — set up now"
    : "Not required for Cashier accounts";

  return (
    <div className="space-y-8">
      <section>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Operations workspace</p>
        <h1 className="page-title mt-1 text-3xl font-bold text-slate-950">Welcome back, {staff.name}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge tone="info">{STAFF_ROLE_LABELS[staff.role]}</Badge>
          <Badge tone={staffRoleRequiresMfa(staff.role) && !staff.mfaEnabled ? "danger" : "success"}>
            {mfaLabel}
          </Badge>
        </div>
      </section>

      <section aria-labelledby="quick-links">
        <h2 id="quick-links" className="text-lg font-bold text-slate-900">
          Quick links
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-lg"
            >
              <p className="font-semibold text-slate-900 transition-colors group-hover:text-indigo-700">{item.label}</p>
              <p className="mt-1 text-sm text-slate-600">{item.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="portal-info" className="max-w-2xl">
        <h2 id="portal-info" className="text-lg font-bold text-slate-900">
          About this portal
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Your workspace is tailored to your role. Cashiers can run the register and
          support customers, while managers and administrators can also control inventory,
          fulfilment, reports, customer access and the staff team.
        </p>
        {staff.role === STAFF_ROLE.CASHIER ? null : (
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            You can invite teammates from{" "}
            <Link href="/pos/team" className="font-semibold text-slate-900 underline">
              Team access
            </Link>
            .
          </p>
        )}
      </section>
    </div>
  );
}
