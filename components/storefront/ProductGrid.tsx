import { ProductCard } from "@/components/storefront/ProductCard";
import type { ProductSummary } from "@/types/catalog";

export function ProductGrid({
  products,
  priorityCount = 0,
}: {
  products: ProductSummary[];
  priorityCount?: number;
}) {
  return (
    <ul className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
      {products.map((product, index) => (
        <li key={product.id} className="h-full">
          <ProductCard product={product} priority={index < priorityCount} />
        </li>
      ))}
    </ul>
  );
}
