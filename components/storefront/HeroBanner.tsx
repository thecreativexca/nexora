import Link from "next/link";

import { ProductImage } from "@/components/common/ProductImage";
import { buttonClasses } from "@/components/ui/Button";
import { CheckIcon } from "@/components/ui/icons";
import { HERO_POINTS } from "@/lib/constants/catalog-facts";
import type { CategorySummary } from "@/types/catalog";

export function HeroBanner({ categories }: { categories: CategorySummary[] }) {
  const showcase = categories.filter((category) => category.image).slice(0, 4);

  return (
    <section className="relative overflow-hidden rounded-3xl border border-indigo-400/20 bg-gradient-to-br from-slate-950 via-indigo-950 to-indigo-800 text-white shadow-xl shadow-indigo-950/15">
      <div aria-hidden="true" className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl" />
      <div aria-hidden="true" className="absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-indigo-400/25 blur-3xl" />
      <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:p-12">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-200">
            Nexora electronics
          </p>
          <h1 className="mt-3 text-3xl font-black leading-tight tracking-tight sm:text-4xl lg:text-5xl">
            Devices, accessories and repairs - delivered to your door
          </h1>
          <p className="mt-4 max-w-xl text-sm text-slate-200 sm:text-base">
            Browse the live catalogue, build your bag and check out as a guest or member. Every
            online order is completed through offline payment on delivery or in-store collection.
          </p>

          <ul className="mt-6 flex flex-col gap-2 text-sm text-slate-200">
            {HERO_POINTS.map((point) => (
              <li key={point} className="flex items-center gap-2">
                <CheckIcon className="h-4 w-4 text-emerald-400" />
                {point}
              </li>
            ))}
          </ul>

          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/products" className={buttonClasses("primary", "lg", "!bg-white !text-indigo-950 shadow-lg hover:!bg-indigo-50")}>
              Shop all products
            </Link>
            <Link
              href="/products?category=services"
              className={buttonClasses("secondary", "lg", "!border-white/30 !bg-transparent !text-white hover:!bg-white/10")}
            >
              Book a service
            </Link>
          </div>
        </div>

        {showcase.length > 0 ? (
          <ul className="grid grid-cols-2 gap-3">
            {showcase.map((category) => (
              <li key={category.id}>
                <Link
                  href={`/products?category=${category.slug}`}
                  className="block rounded-2xl bg-white/10 p-2 ring-1 ring-white/15 backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-white/15"
                >
                  <ProductImage
                    src={category.image}
                    alt={category.name}
                    sizes="(max-width: 1024px) 40vw, 240px"
                  />
                  <span className="mt-2 block text-center text-xs font-semibold text-slate-100">
                    {category.name}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
