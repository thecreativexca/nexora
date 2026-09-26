import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { CategoryFilterBar } from "@/components/storefront/CategoryFilterBar";
import { Pagination } from "@/components/storefront/Pagination";
import { ProductGrid } from "@/components/storefront/ProductGrid";
import { buttonClasses } from "@/components/ui/Button";
import { CATALOG_SORTS, CATALOG_SORT_LABELS } from "@/lib/constants/catalog";
import { listActiveCategories } from "@/lib/services/category.service";
import { listProducts } from "@/lib/services/product.service";
import { parseCatalogQuery } from "@/lib/validations/catalog-query";
import type { CategorySummary, ProductListResult } from "@/types/catalog";

export const metadata: Metadata = {
  title: "All products",
  description:
    "Browse every product in the Nexora catalogue: phones, laptops, tablets, accessories and services.",
};

/**
 * Server-rendered catalogue page.
 *
 * Category + search filtering happens in MongoDB, driven by the URL, so the
 * page works without JavaScript and every link is shareable.
 */
export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  const query = parseCatalogQuery(await searchParams);

  let categories: CategorySummary[] = [];
  let result: ProductListResult | null = null;
  let databaseUnavailable = false;

  try {
    categories = await listActiveCategories();
    result = await listProducts(query);
  } catch {
    databaseUnavailable = true;
  }

  if (databaseUnavailable || !result) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <ErrorState
          title="Catalogue temporarily unavailable"
          description="We could not read the product database. Please refresh the page in a moment."
        />
      </div>
    );
  }

  const activeCategory = categories.find((item) => item.slug === query.categorySlug) ?? null;
  const categoryNotFound = Boolean(query.categorySlug) && !activeCategory;
  const heading = activeCategory
    ? activeCategory.name
    : query.search
      ? `Search results for “${query.search}”`
      : "All products";

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{heading}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {result.total} {result.total === 1 ? "product" : "products"}
            {activeCategory ? ` in ${activeCategory.name}` : ""}
            {query.search ? ` matching “${query.search}”` : ""}
          </p>
        </div>

        <form method="get" action="/products" className="flex items-end gap-2">
          {query.search ? <input type="hidden" name="q" value={query.search} /> : null}
          {activeCategory ? (
            <input type="hidden" name="category" value={activeCategory.slug} />
          ) : null}
          <div className="flex flex-col gap-1">
            <label htmlFor="sort" className="text-xs font-medium text-slate-600">
              Sort by
            </label>
            <select
              id="sort"
              name="sort"
              defaultValue={query.sort}
              className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
            >
              {CATALOG_SORTS.map((sort) => (
                <option key={sort} value={sort}>
                  {CATALOG_SORT_LABELS[sort]}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className={buttonClasses("secondary", "md")}>
            Apply
          </button>
        </form>
      </header>

      <div className="mb-6 space-y-3">
        <CategoryFilterBar
          categories={categories}
          activeSlug={activeCategory?.slug ?? ""}
          searchQuery={query.search}
        />

        {categoryNotFound ? (
          <p
            role="status"
            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
          >
            We could not find the category “{query.categorySlug}”, so the full catalogue is shown
            instead.
          </p>
        ) : null}

        {query.search ? (
          <p className="text-sm text-slate-600">
            Showing matches for <span className="font-semibold">{query.search}</span>.{" "}
            <Link href={activeCategory ? `/products?category=${activeCategory.slug}` : "/products"} className="underline">
              Clear search
            </Link>
          </p>
        ) : null}
      </div>

      {result.products.length > 0 ? (
        <>
          <ProductGrid products={result.products} priorityCount={4} />
          <Pagination
            page={result.page}
            totalPages={result.totalPages}
            query={{
              q: query.search,
              category: activeCategory?.slug ?? "",
              sort: query.sort === "newest" ? "" : query.sort,
            }}
          />
        </>
      ) : (
        <EmptyState
          title={
            query.search
              ? "No products match your search"
              : activeCategory
                ? `${activeCategory.name} is empty right now`
                : "No products published yet"
          }
          description={
            query.search
              ? `Nothing matched “${query.search}”. Try a shorter term or a different category.`
              : "New stock is added regularly - please check back soon or browse another category."
          }
          action={
            <Link href="/products" className={buttonClasses("primary", "md")}>
              Show all products
            </Link>
          }
        />
      )}
    </div>
  );
}
