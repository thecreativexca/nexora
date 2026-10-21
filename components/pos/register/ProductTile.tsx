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
  priority = false,
}: {
  product: PosProduct;
  inCartQuantity: number;
  onAdd: (product: PosProduct) => void;
  priority?: boolean;
}) {
  const outOfStock = !product.isService && product.stock <= 0;
  const atCeiling =
    product.maxOrderable !== null && inCartQuantity >= product.maxOrderable;

  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md">
      <div className="relative">
        <ProductImage
          src={product.image}
          alt={product.name}
          sizes="(max-width: 768px) 50vw, 25vw"
          priority={priority}
        />
        {inCartQuantity > 0 ? (
          <span className="absolute right-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-slate-900 px-1.5 text-xs font-bold text-white">
            {inCartQuantity}
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex flex-1 flex-col gap-1">
        <p className="line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-slate-900" title={product.name}>
          {product.name}
        </p>
        <div className="flex items-center gap-1.5 truncate text-xs text-slate-500">
          <span className="truncate">SKU {product.sku}</span>
          {product.barcode ? (
            <>
              <span className="text-slate-300">·</span>
              <span className="font-mono text-[10px] text-slate-500" title={`Barcode: ${product.barcode}`}>
                {product.barcode}
              </span>
            </>
          ) : null}
        </div>
        {product.brand || product.deviceModel || product.caseColor ? <p className="truncate text-[11px] font-medium text-indigo-600" title={[product.brand, product.deviceModel, product.caseColor].filter(Boolean).join(" · ")}>{[product.brand, product.deviceModel, product.caseColor].filter(Boolean).join(" · ")}</p> : null}

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
