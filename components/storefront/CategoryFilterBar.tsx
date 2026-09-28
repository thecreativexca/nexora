import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";
import type { CategorySummary } from "@/types/catalog";

/**
 * Category chips for the listing page. Slugs come from MongoDB, and the search
 * term is preserved when switching category.
 */
export function CategoryFilterBar({
  categories,
  activeSlug,
  searchQuery,
}: {
  categories: CategorySummary[];
  activeSlug: string;
  searchQuery: string;
}) {
  const buildHref = (slug: string) => {
    const params = new URLSearchParams();
    if (searchQuery) params.set("q", searchQuery);
    if (slug) params.set("category", slug);
    const queryString = params.toString();
    return queryString ? `/products?${queryString}` : "/products";
  };

  return (
    <nav aria-label="Filter by category" className="flex flex-wrap items-center gap-2">
      <FilterChip href={buildHref("")} active={!activeSlug}>
        All
      </FilterChip>
      {categories.map((category) => (
        <FilterChip
          key={category.slug}
          href={buildHref(category.slug)}
          active={activeSlug === category.slug}
        >
          {category.name}
          <span className="ml-1 text-xs text-slate-400">{category.productCount}</span>
        </FilterChip>
      ))}
    </nav>
  );
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors",
        active
          ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
          : "border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700",
      )}
    >
      {children}
    </Link>
  );
}
