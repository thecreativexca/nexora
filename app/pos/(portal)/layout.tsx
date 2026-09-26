import type { ReactNode } from "react";

import { requireStaff } from "@/lib/auth/staff-session";
import { PortalSidebar } from "@/components/pos/PortalSidebar";
import { StaffLogoutButton } from "@/components/pos/StaffLogoutButton";
import { getNavItems } from "@/components/pos/nav-items";
import { Badge } from "@/components/ui/Badge";
import { STAFF_ROLE_LABELS } from "@/lib/constants/staff";

/**
 * Signed-in portal shell. `requireStaff` re-validates the session on every
 * request: a session that did not satisfy MFA for an MFA-required role resolves
 * to NULL and the member is sent to /pos/login to re-authenticate (with MFA).
 */
export default async function PosPortalLayout({ children }: { children: ReactNode }) {
  const staff = await requireStaff();

  const navItems = getNavItems(staff.role);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex items-baseline gap-3">
          <span className="text-sm font-bold uppercase tracking-widest text-slate-400">
            Nexora
          </span>
          <span className="text-sm font-semibold text-slate-300">/</span>
          <span className="text-sm font-semibold text-slate-900">{staff.name}</span>
          <Badge tone="info">{STAFF_ROLE_LABELS[staff.role]}</Badge>
        </div>
        <StaffLogoutButton />
      </header>

      <div className="flex flex-1">
        <aside className="border-r border-slate-200 bg-white">
          <PortalSidebar items={navItems} />
        </aside>
        <main className="min-w-0 flex-1 p-6 md:p-10">{children}</main>
      </div>
    </div>
  );
}