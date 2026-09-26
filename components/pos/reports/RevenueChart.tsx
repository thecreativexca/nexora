"use client";

import { cn } from "@/lib/utils/cn";
import { formatMoney } from "@/lib/utils/money";
import type { SalesReportDay } from "@/types/order";

/**
 * Tiny dependency-free 7-day revenue bar chart. No chart library in the project
 * - a plain flex box keeps the bundle small and the look consistent.
 */
export function RevenueChart({ days }: { days: SalesReportDay[] }) {
  const maxRevenue = Math.max(...days.map((day) => day.revenueInPaise), 0);

  return (
    <div className="flex h-40 items-end gap-2 sm:gap-3">
      {days.map((day) => {
        const height =
          maxRevenue > 0 ? Math.max((day.revenueInPaise / maxRevenue) * 100, 3) : 3;
        const isToday =
          day.label === days[days.length - 1].label;

        return (
          <div
            key={day.date}
            className="group relative flex flex-1 flex-col items-center gap-1"
          >
            <div className="relative flex w-full flex-1 items-end">
              <div
                className={cn(
                  "w-full rounded-t-md transition-colors group-hover:opacity-80",
                  isToday ? "bg-slate-900" : "bg-slate-300",
                )}
                style={{ height: `${height}%` }}
                aria-hidden="true"
              />
              <div
                role="tooltip"
                className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs font-semibold text-white opacity-0 shadow transition-opacity group-hover:opacity-100"
              >
                {day.label}: {formatMoney(day.revenueInPaise)}
              </div>
            </div>
            <span className="text-[11px] font-medium text-slate-500">
              {day.label.slice(0, 3)}
            </span>
          </div>
        );
      })}
    </div>
  );
}