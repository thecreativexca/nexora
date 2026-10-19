import type { ReactNode } from "react";

import { requireStaff } from "@/lib/auth/staff-session";
import { PortalSidebar } from "@/components/pos/PortalSidebar";
import { StaffLogoutButton } from "@/components/pos/StaffLogoutButton";
import { getNavItems } from "@/components/pos/nav-items";
import { Badge } from "@/components/ui/Badge";
import { STAFF_ROLE_LABELS } from "@/lib/constants/staff";
import { Logo } from "@/components/common/Logo";

/**
 * Signed-in portal shell. `requireStaff` re-validates the session on every
 * request: an expired/revoked session resolves to NULL and the member is sent
 * to /pos/login to sign in again.
 */
export default async function PosPortalLayout({ children }: { children: ReactNode }) {
  const staff = await requireStaff();

  const navItems = getNavItems(staff);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50/70">
      <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-slate-200/80 bg-white/90 px-4 py-3 shadow-sm backdrop-blur-xl sm:px-6">
        <div className="flex min-w-0 items-center gap-4">
          <Logo className="hidden sm:inline-flex" />
          <span className="hidden h-8 w-px bg-slate-200 sm:block" />
          <div className="min-w-0">
            <span className="block truncate text-sm font-semibold text-slate-900">{staff.name}</span>
            <Badge tone="info" className="mt-1">{STAFF_ROLE_LABELS[staff.role]}</Badge>
          </div>
        </div>
        <StaffLogoutButton />
      </header>

      <div className="flex flex-1 flex-col md:flex-row">
        <aside className="border-b border-slate-200 bg-white md:border-b-0 md:border-r">
          <PortalSidebar items={navItems} />
        </aside>
        <main className="min-w-0 flex-1 p-4 sm:p-6 md:p-8 lg:p-10">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
