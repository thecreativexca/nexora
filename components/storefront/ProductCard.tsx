import Link from "next/link";

import { ProductImage } from "@/components/common/ProductImage";
import { AddToCartButton } from "@/components/storefront/AddToCartButton";
import { Badge } from "@/components/ui/Badge";
import { Price } from "@/components/ui/Price";
import type { ProductSummary } from "@/types/catalog";

export function ProductCard({
  product,
  priority = false,
}: {
  product: ProductSummary;
  priority?: boolean;
}) {
  const outOfStock = !product.isService && product.stock <= 0;
  const lowStock = !product.isService && product.stock > 0 && product.stock <= 3;

  return (
    <article className="group flex h-full flex-col rounded-xl border border-slate-200 bg-white p-3 transition-shadow hover:shadow-md">
      <Link href={`/products/${product.slug}`} className="block rounded-lg">
        <div className="relative">
          <ProductImage src={product.image} alt={product.name} priority={priority} />
          {product.isFeatured ? (
            <span className="absolute left-2 top-2">
              <Badge tone="info">Featured</Badge>
            </span>
          ) : null}
        </div>
        <h3 className="mt-3 line-clamp-2 text-sm font-semibold text-slate-900 group-hover:underline">
          {product.name}
        </h3>
      </Link>

      <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {product.categoryName}
      </p>

      <div className="mt-2 flex flex-wrap items-baseline gap-2">
        <Price
          amountInPaise={product.priceInPaise}
          className="text-base font-bold text-slate-900"
        />
        <span className="text-xs text-slate-500">incl. taxes</span>
      </div>

      <div className="mt-2 min-h-[26px]">
        {product.isService ? (
          <Badge tone="success">Service - bookable</Badge>
        ) : outOfStock ? (
          <Badge tone="danger">Out of stock</Badge>
        ) : lowStock ? (
          <Badge tone="warning">Only {product.stock} left</Badge>
        ) : (
          <Badge tone="neutral">In stock</Badge>
        )}
      </div>

      <div className="mt-3 pt-1">
        <AddToCartButton product={product} />
      </div>
    </article>
  );
}
