import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ErrorState } from "@/components/common/ErrorState";
import { ProductImage } from "@/components/common/ProductImage";
import { AddToCartButton } from "@/components/storefront/AddToCartButton";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { Price } from "@/components/ui/Price";
import { CheckIcon, ShieldIcon, TruckIcon, WrenchIcon } from "@/components/ui/icons";
import { getActiveProductBySlug } from "@/lib/services/product.service";

export async function generateMetadata({
  params,
}: PageProps<"/products/[slug]">): Promise<Metadata> {
  const { slug } = await params;

  try {
    const product = await getActiveProductBySlug(slug);
    if (!product) return { title: "Product not found" };
    return {
      title: product.name,
      description: product.description.slice(0, 160) || `Buy ${product.name} from Nexora.`,
    };
  } catch {
    return { title: "Product" };
  }
}

export default async function ProductDetailPage({ params }: PageProps<"/products/[slug]">) {
  const { slug } = await params;

  let product = null;
  let databaseUnavailable = false;

  try {
    product = await getActiveProductBySlug(slug);
  } catch {
    databaseUnavailable = true;
  }

  if (databaseUnavailable) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <ErrorState
          title="Product unavailable right now"
          description="We could not read the product database. Please try again in a moment."
        />
      </div>
    );
  }

  if (!product) notFound();

  const outOfStock = !product.isService && product.stock <= 0;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <nav aria-label="Breadcrumb" className="mb-5 text-sm text-slate-600">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link href="/" className="hover:text-slate-900">
              Home
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href="/products" className="hover:text-slate-900">
              Products
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href={`/products?category=${product.categorySlug}`} className="hover:text-slate-900">
              {product.categoryName}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="font-medium text-slate-900">
            {product.name}
          </li>
        </ol>
      </nav>

      <div className="grid gap-8 rounded-3xl border border-slate-200/90 bg-white p-4 shadow-xl shadow-slate-900/5 sm:p-6 lg:grid-cols-2 lg:items-start lg:p-8">
        <div className="overflow-hidden rounded-2xl bg-slate-50 p-2">
          <ProductImage
            src={product.image}
            alt={product.name}
            sizes="(max-width: 1024px) 100vw, 560px"
            priority
          />
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{product.categoryName}</Badge>
            {product.isFeatured ? <Badge tone="info">Featured</Badge> : null}
            {product.isService ? <Badge tone="success">Service</Badge> : null}
            {outOfStock ? <Badge tone="danger">Out of stock</Badge> : null}
          </div>

          <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {product.name}
          </h1>

          <p className="mt-3 flex items-baseline gap-2">
            <Price amountInPaise={product.priceInPaise} className="text-3xl font-black text-slate-900" />
            <span className="text-sm text-slate-500">incl. taxes</span>
          </p>

          <p className="mt-1 text-xs text-slate-500">
            SKU {product.sku}
            {product.isService ? " · no stock limit" : ` · ${product.stock} in stock`}
          </p>

          <p className="mt-5 text-sm leading-6 text-slate-700">
            {product.description || "No description provided for this item yet."}
          </p>

          <div className="mt-6 max-w-sm">
            <AddToCartButton product={product} size="lg" />
            {outOfStock ? (
              <p className="mt-2 text-sm text-slate-600">
                This item is out of stock - check back soon or browse similar products.
              </p>
            ) : null}
          </div>

          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            <li className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-sm text-slate-700">
              <TruckIcon className="h-4 w-4 shrink-0 text-slate-500" />
              Pay on delivery or collection (Cash, UPI, Card).
            </li>
            <li className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-sm text-slate-700">
              <ShieldIcon className="h-4 w-4 shrink-0 text-slate-500" />
              Genuine product with brand warranty.
            </li>
            <li className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-sm text-slate-700">
              <CheckIcon className="h-4 w-4 shrink-0 text-slate-500" />
              7-day replacement on unopened devices.
            </li>
            <li className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-sm text-slate-700">
              <WrenchIcon className="h-4 w-4 shrink-0 text-slate-500" />
              In-house service centre for setup and repairs.
            </li>
          </ul>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={`/products?category=${product.categorySlug}`} className={buttonClasses("secondary", "md")}>
              More in {product.categoryName}
            </Link>
            <Link href="/products" className={buttonClasses("ghost", "md")}>
              Continue shopping
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
