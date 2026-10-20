import Link from "next/link";

import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { SectionHeading } from "@/components/common/SectionHeading";
import { CategoryGrid } from "@/components/storefront/CategoryGrid";
import { HeroBanner } from "@/components/storefront/HeroBanner";
import { ProductGrid } from "@/components/storefront/ProductGrid";
import { buttonClasses } from "@/components/ui/Button";
import {
  HOMEPAGE_FEATURED_LIMIT,
  HOMEPAGE_LATEST_LIMIT,
} from "@/lib/constants/catalog";
import { SERVICE_FACTS } from "@/lib/constants/catalog-facts";
import { listActiveCategories } from "@/lib/services/category.service";
import {
  getFeaturedProducts,
  getLatestProducts,
} from "@/lib/services/product.service";
import type { CategorySummary, ProductSummary } from "@/types/catalog";

export default async function HomePage() {
  let categories: CategorySummary[] = [];
  let featured: ProductSummary[] = [];
  let latest: ProductSummary[] = [];
  let databaseUnavailable = false;

  try {
    categories = await listActiveCategories();
    [featured, latest] = await Promise.all([
      getFeaturedProducts(HOMEPAGE_FEATURED_LIMIT),
      getLatestProducts(HOMEPAGE_LATEST_LIMIT),
    ]);
  } catch {
    databaseUnavailable = true;
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-16 px-4 py-8 sm:px-6 lg:px-8">
      <HeroBanner categories={databaseUnavailable ? [] : categories} />

      {databaseUnavailable ? (
        <ErrorState
          title="Catalogue temporarily unavailable"
          description="We could not read the product database, so the shelves cannot be displayed right now. Your bag is stored on this device - please refresh in a moment."
          action={
            <Link href="/" className={buttonClasses("primary", "md")}>
              Try again
            </Link>
          }
        />
      ) : (
        <>
          <section aria-labelledby="shop-by-category">
            <SectionHeading
              title="Shop by category"
              description="Browse the live catalogue by department."
              action={
                <Link href="/products" className={buttonClasses("secondary", "sm")}>
                  View all products
                </Link>
              }
            />
            <h2 id="shop-by-category" className="sr-only">
              Shop by category
            </h2>
            {categories.length > 0 ? (
              <CategoryGrid categories={categories} />
            ) : (
              <EmptyState
                title="No categories published yet"
                description="Once the catalogue is seeded, categories appear here automatically."
              />
            )}
          </section>

          <section aria-labelledby="featured-products">
            <h2 id="featured-products" className="sr-only">
              Featured products
            </h2>
            <SectionHeading
              title="Featured products"
              description="Hand-picked devices and accessories from our shelves."
            />
            {featured.length > 0 ? (
              <ProductGrid products={featured} priorityCount={4} />
            ) : (
              <EmptyState
                title="No featured products right now"
                description="Browse the full catalogue while we restock the featured shelf."
                action={
                  <Link href="/products" className={buttonClasses("primary", "md")}>
                    Browse catalogue
                  </Link>
                }
              />
            )}
          </section>

          <section aria-labelledby="new-arrivals">
            <h2 id="new-arrivals" className="sr-only">
              New arrivals
            </h2>
            <SectionHeading
              title="New arrivals"
              description="The latest items added to the Nexora catalogue."
              action={
                <Link href="/products" className={buttonClasses("secondary", "sm")}>
                  Browse everything
                </Link>
              }
            />
            {latest.length > 0 ? (
              <ProductGrid products={latest} />
            ) : (
              <EmptyState
                title="The catalogue is empty"
                description="Products appear here as soon as they are published."
              />
            )}
          </section>

          <section
            aria-labelledby="why-nexora"
            className="overflow-hidden rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-cyan-50 p-6 shadow-sm sm:p-8"
          >
            <h2 id="why-nexora" className="text-xl font-bold tracking-tight text-slate-900">
              Why shop with Nexora
            </h2>
            <ul className="mt-4 grid gap-4 sm:grid-cols-3">
              {SERVICE_FACTS.map((fact) => (
                <li
                  key={fact}
                  className="rounded-2xl border border-white bg-white/80 p-4 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur"
                >
                  {fact}
                </li>
              ))}
            </ul>
          </section>

          <section className="grid overflow-hidden rounded-3xl bg-slate-950 text-white shadow-xl lg:grid-cols-[1.2fr_0.8fr]" aria-labelledby="cod-home">
            <div className="p-6 sm:p-8 lg:p-10">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-300">Simple checkout</p>
              <h2 id="cod-home" className="mt-2 text-2xl font-black sm:text-3xl">Order online. Pay when it arrives.</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                Nexora website orders use Cash on Delivery, so checkout never asks for card, UPI, or bank-transfer details. Staff record payment only after delivery.
              </p>
              <Link href="/products" className={`${buttonClasses("primary", "md")} mt-6`}>
                Explore the catalogue
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-px bg-white/10 p-px sm:grid-cols-3 lg:grid-cols-1">
              {[
                ["01", "Choose live catalogue items"],
                ["02", "Confirm your delivery address"],
                ["03", "Pay cash on delivery"],
              ].map(([step, label]) => (
                <div key={step} className="bg-slate-900 p-5 sm:p-6">
                  <span className="text-xs font-black text-indigo-300">{step}</span>
                  <p className="mt-2 text-sm font-semibold text-slate-100">{label}</p>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
