import "server-only";

import { Types } from "mongoose";

import { connectDB } from "@/lib/db/mongodb";
import { ensureRequestTime } from "@/lib/db/request-time";
import { listActiveCategories } from "@/lib/services/category.service";
import { toDatabaseError } from "@/lib/services/service-errors";
import type { CatalogSort } from "@/lib/constants/catalog";
import { buildContainsRegExp } from "@/lib/utils/search";
import { Product } from "@/models/Product";
import type {
  CatalogQuery,
  ProductListResult,
  ProductSummary,
} from "@/types/catalog";

export interface LeanProduct {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  description?: string;
  sku: string;
  priceInPaise: number;
  stock: number;
  isService?: boolean;
  isFeatured?: boolean;
  image?: string;
  category: Types.ObjectId;
}

const PRODUCT_FIELDS =
  "name slug description sku priceInPaise stock isService isFeatured image category";

const SORT_SPECS: Record<CatalogSort, Record<string, 1 | -1>> = {
  newest: { createdAt: -1, _id: -1 },
  price_asc: { priceInPaise: 1, _id: 1 },
  price_desc: { priceInPaise: -1, _id: 1 },
  name_asc: { name: 1, _id: 1 },
};

function toProductSummary(
  product: LeanProduct,
  categoryName: string,
  categorySlug: string,
): ProductSummary {
  return {
    id: String(product._id),
    name: product.name,
    slug: product.slug,
    description: product.description ?? "",
    sku: product.sku,
    priceInPaise: product.priceInPaise,
    stock: product.stock,
    isService: Boolean(product.isService),
    isFeatured: Boolean(product.isFeatured),
    image: product.image ?? "",
    categoryId: String(product.category),
    categoryName,
    categorySlug,
  };
}

function emptyResult(pageSize: number): ProductListResult {
  return { products: [], total: 0, page: 1, pageSize, totalPages: 0 };
}

/**
 * Public catalogue query.
 *
 * Only active products in active categories are ever returned, prices/stock are
 * read straight from MongoDB, and the search term is escaped before it reaches
 * a regular expression.
 */
export async function listProducts(query: CatalogQuery): Promise<ProductListResult> {
  await ensureRequestTime();

  try {
    await connectDB();

    const categories = await listActiveCategories();
    if (categories.length === 0) return emptyResult(query.pageSize);

    let inScope = categories;
    if (query.categorySlug) {
      const matched = categories.find((category) => category.slug === query.categorySlug);
      if (!matched) return emptyResult(query.pageSize);
      inScope = [matched];
    }

    const filter: Record<string, unknown> = {
      isActive: true,
      category: { $in: inScope.map((category) => new Types.ObjectId(category.id)) },
    };

    if (query.featuredOnly) filter.isFeatured = true;

    if (query.search) {
      const pattern = buildContainsRegExp(query.search);
      // Whitelisted, escaped fields only - no raw user input in the query.
      filter.$or = [{ name: pattern }, { description: pattern }, { sku: pattern }];
    }

    const [documents, total] = await Promise.all([
      Product.find(filter)
        .select(PRODUCT_FIELDS)
        .sort(SORT_SPECS[query.sort])
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .lean<LeanProduct[]>(),
      Product.countDocuments(filter),
    ]);

    const categoryById = new Map(categories.map((category) => [category.id, category]));

    return {
      products: documents.map((document) => {
        const category = categoryById.get(String(document.category));
        return toProductSummary(
          document,
          category?.name ?? "Uncategorised",
          category?.slug ?? "",
        );
      }),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    };
  } catch (error) {
    throw toDatabaseError(error);
  }
}

export async function getFeaturedProducts(limit: number): Promise<ProductSummary[]> {
  const result = await listProducts({
    search: "",
    categorySlug: "",
    sort: "newest",
    page: 1,
    pageSize: limit,
    featuredOnly: true,
  });
  return result.products;
}

export async function getLatestProducts(limit: number): Promise<ProductSummary[]> {
  const result = await listProducts({
    search: "",
    categorySlug: "",
    sort: "newest",
    page: 1,
    pageSize: limit,
    featuredOnly: false,
  });
  return result.products;
}

export async function getActiveProductBySlug(
  slug: string,
): Promise<ProductSummary | null> {
  await ensureRequestTime();

  try {
    await connectDB();

    const product = await Product.findOne({ slug, isActive: true })
      .select(PRODUCT_FIELDS)
      .lean<LeanProduct | null>();
    if (!product) return null;

    const categories = await listActiveCategories();
    const category = categories.find((item) => item.id === String(product.category));
    if (!category) return null;

    return toProductSummary(product, category.name, category.slug);
  } catch (error) {
    throw toDatabaseError(error);
  }
}
