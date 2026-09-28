"use client";

import { BagIcon } from "@/components/ui/icons";
import { useCart } from "@/hooks/useCart";

export function CartButton() {
  const { itemCount, hydrated, openDrawer } = useCart();

  return (
    <button
      type="button"
      onClick={openDrawer}
      aria-label={
        hydrated
          ? `Open shopping bag, ${itemCount} ${itemCount === 1 ? "item" : "items"}`
          : "Open shopping bag"
      }
      className="relative inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
    >
      <BagIcon />
      <span className="hidden sm:inline">Bag</span>
      {hydrated && itemCount > 0 ? (
        <span
          aria-hidden="true"
          className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-600 px-1 text-[11px] font-bold text-white ring-2 ring-white"
        >
          {itemCount > 99 ? "99+" : itemCount}
        </span>
      ) : null}
    </button>
  );
}
