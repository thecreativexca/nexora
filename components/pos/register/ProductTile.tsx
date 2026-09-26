"use client";

import { ProductImage } from "@/components/common/ProductImage";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Price } from "@/components/ui/Price";
import { cn } from "@/lib/utils/cn";
import type { PosProduct } from "@/types/pos";

export function ProductTile({
  product,
  inCartQuantity,
  onAdd,
}: {
  product: PosProduct;
  inCartQuantity: number;
  onAdd: (product: PosProduct) => void;
}) {
  const outOfStock = !product.isService && product.stock <= 0;
  const atCeiling =
    product.maxOrderable !== null && inCartQuantity >= product.maxOrderable;

  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md">
      <div className="relative">
        <ProductImage
          src={product.image}
          alt={product.name}
          sizes="(max-width: 768px) 50vw, 25vw"
        />
        {inCartQuantity > 0 ? (
          <span className="absolute right-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-slate-900 px-1.5 text-xs font-bold text-white">
            {inCartQuantity}
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex flex-1 flex-col gap-1">
        <p className="truncate text-sm font-semibold text-slate-900" title={product.name}>
          {product.name}
        </p>
        <p className="truncate text-xs text-slate-500">SKU {product.sku}</p>

        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {product.isService ? (
            <Badge tone="neutral">Service</Badge>
          ) : outOfStock ? (
            <Badge tone="danger">Out of stock</Badge>
          ) : (
            <Badge tone="success">{product.stock} in stock</Badge>
          )}
          {product.maxOrderable !== null && product.stock > 0 ? (
            <span className="text-[11px] text-slate-400">max {product.maxOrderable}</span>
          ) : null}
        </div>

        <div className="mt-2 flex items-end justify-between gap-2">
          <Price amountInPaise={product.priceInPaise} className="text-base font-bold text-slate-900" />
          <Button
            size="sm"
            variant={inCartQuantity > 0 ? "secondary" : "primary"}
            disabled={outOfStock || atCeiling}
            onClick={() => onAdd(product)}
            className={cn(inCartQuantity > 0 && "text-emerald-700")}
          >
            {outOfStock ? "Sold out" : atCeiling ? "In cart" : inCartQuantity > 0 ? "Add" : "Add +"}
          </Button>
        </div>
      </div>
    </div>
  );
}