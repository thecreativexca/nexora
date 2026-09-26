import Link from "next/link";

import { ProductImage } from "@/components/common/ProductImage";
import type { CategorySummary } from "@/types/catalog";

export function CategoryGrid({ categories }: { categories: CategorySummary[] }) {
  if (categories.length === 0) return null;

  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {categories.map((category) => (
        <li key={category.id}>
          <Link
            href={`/products?category=${category.slug}`}
            className="flex h-full flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-center transition-shadow hover:shadow-md"
          >
            <ProductImage
              src={category.image}
              alt={category.name}
              sizes="(max-width: 640px) 50vw, 20vw"
            />
            <span className="text-sm font-semibold text-slate-900">{category.name}</span>
            <span className="text-xs text-slate-500">
              {category.productCount} {category.productCount === 1 ? "product" : "products"}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
