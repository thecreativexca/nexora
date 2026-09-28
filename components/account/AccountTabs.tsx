"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils/cn";

const TABS = [
  { href: "/account", label: "Overview", exact: true },
  { href: "/account/profile", label: "Profile", exact: false },
] as const;

export function AccountTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="Account sections" className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
      {TABS.map((tab) => {
        const isActive = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors",
              isActive
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-indigo-50 hover:text-indigo-700",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
