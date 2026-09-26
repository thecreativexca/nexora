"use client";

import { buttonClasses, type ButtonSize } from "@/components/ui/Button";
import { BagIcon } from "@/components/ui/icons";
import { useCart } from "@/hooks/useCart";
import { cn } from "@/lib/utils/cn";
import type { ProductSummary } from "@/types/catalog";

export type AddToCartProduct = Pick<
  ProductSummary,
  "id" | "slug" | "name" | "image" | "priceInPaise" | "isService" | "stock"
>;

/**
 * Adds a line to the bag. Physical products respect stock; services are always
 * purchasable (the server enforces the same rules at checkout).
 */
export function AddToCartButton({
  product,
  size = "md",
  className,
}: {
  product: AddToCartProduct;
  size?: ButtonSize;
  className?: string;
}) {
  const { addLine } = useCart();
  const outOfStock = !product.isService && product.stock <= 0;

  return (
    <button
      type="button"
      disabled={outOfStock}
      aria-label={
        outOfStock ? `${product.name} is out of stock` : `Add ${product.name} to bag`
      }
      onClick={() =>
        addLine(
          {
            productId: product.id,
            slug: product.slug,
            name: product.name,
            image: product.image,
            unitPriceInPaise: product.priceInPaise,
            isService: product.isService,
            stockLimit: product.isService ? null : product.stock,
          },
          1,
        )
      }
      className={buttonClasses("primary", size, cn("w-full", className))}
    >
      <BagIcon className="h-4 w-4" />
      {outOfStock ? "Out of stock" : "Add to bag"}
    </button>
  );
}
