"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { PosNavItem } from "@/components/pos/nav-items";
import { cn } from "@/lib/utils/cn";

/** Role-filtered portal navigation with active-route highlighting. */
export function PortalSidebar({ items }: { items: PosNavItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Portal" className="flex w-56 shrink-0 flex-col gap-1 p-3">
      {items.map((item) => {
        const active = item.href === "/pos" ? pathname === "/pos" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-semibold",
              active
                ? "bg-slate-900 text-white"
                : "text-slate-700 hover:bg-slate-100",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}