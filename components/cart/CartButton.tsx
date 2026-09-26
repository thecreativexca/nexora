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
      className="relative inline-flex h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
    >
      <BagIcon />
      <span className="hidden sm:inline">Bag</span>
      {hydrated && itemCount > 0 ? (
        <span
          aria-hidden="true"
          className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-900 px-1 text-[11px] font-bold text-white"
        >
          {itemCount > 99 ? "99+" : itemCount}
        </span>
      ) : null}
    </button>
  );
}
