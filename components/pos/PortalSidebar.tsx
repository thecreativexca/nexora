"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { PosNavItem } from "@/components/pos/nav-items";
import { cn } from "@/lib/utils/cn";

/** Role-filtered portal navigation with active-route highlighting. */
export function PortalSidebar({ items }: { items: PosNavItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Portal" className="flex w-full max-w-[100vw] shrink-0 gap-1 overflow-x-auto p-2 md:w-60 md:flex-col md:overflow-visible md:p-4">
      {items.map((item) => {
        const active = item.href === "/pos" ? pathname === "/pos" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors md:w-full",
              active
                ? "bg-indigo-600 text-white shadow-sm shadow-indigo-900/15"
                : "text-slate-600 hover:bg-indigo-50 hover:text-indigo-700",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
