import "server-only";

import { Types } from "mongoose";

import { connectDB } from "@/lib/db/mongodb";
import { ensureRequestTime } from "@/lib/db/request-time";
import { listActiveCategories } from "@/lib/services/category.service";
import { toDatabaseError } from "@/lib/services/service-errors";
import { buildContainsRegExp, normalizeSearchTerm } from "@/lib/utils/search";
import { Product } from "@/models/Product";
import type {
  PosCategoryOption,
  PosProduct,
  PosProductListResult,
} from "@/types/pos";

interface LeanPosProduct {
  _id: Types.ObjectId;
  name: string;
  sku: string;
  barcode?: string;
  description?: string;
  priceInPaise: number;
  mrpInPaise?: number;
  taxRate?: number;
  unit?: string;
  stock: number;
  isService?: boolean;
  isFeatured?: boolean;
  image?: string;
  category: Types.ObjectId;
}

const POS_PRODUCT_FIELDS =
  "name slug sku barcode description priceInPaise mrpInPaise taxRate unit stock isService isFeatured image category";

function toPosProduct(product: LeanPosProduct, categoryName: string): PosProduct {
  const isService = Boolean(product.isService);
  return {
    id: String(product._id),
    name: product.name,
    sku: product.sku,
    barcode: product.barcode ?? "",
    priceInPaise: product.priceInPaise,
    mrpInPaise: product.mrpInPaise ?? product.priceInPaise,
    taxRate: product.taxRate ?? 0,
    unit: product.unit ?? "Piece",
    stock: product.stock,
    isService,
    isFeatured: Boolean(product.isFeatured),
    image: product.image ?? "",
    description: product.description ?? "",
    categoryId: String(product.category),
    categoryName: categoryName || "Uncategorised",
    // Services never depend on physical stock; physical items cap at stock.
    maxOrderable: isService ? null : product.stock,
  };
}

export interface ListPosProductsInput {
  search: string;
  categoryId: string;
  page: number;
  pageSize: number;
}

/**
 * Register catalogue: only active products inside active categories. Search is
 * case-insensitive and regex-escaped, and the category filter composes with it.
 */
export async function listPosProducts(
  input: ListPosProductsInput,
): Promise<PosProductListResult> {
  await ensureRequestTime();

  try {
    await connectDB();

    const categories = await listActiveCategories();
    if (categories.length === 0) {
      return { products: [], total: 0, page: input.page, pageSize: input.pageSize, totalPages: 0, categories: [] };
    }

    const categoryOptions: PosCategoryOption[] = categories.map((category) => ({
      id: category.id,
      name: category.name,
    }));

    const categoryById = new Map(categories.map((category) => [category.id, category]));

    const filter: Record<string, unknown> = {
      isActive: true,
      category: { $in: categories.map((category) => new Types.ObjectId(category.id)) },
    };

    if (input.categoryId) {
      if (!categoryById.has(input.categoryId)) {
        return { products: [], total: 0, page: input.page, pageSize: input.pageSize, totalPages: 0, categories: categoryOptions };
      }
      filter.category = new Types.ObjectId(input.categoryId);
    }

    const term = normalizeSearchTerm(input.search);
    if (term) {
      const pattern = buildContainsRegExp(term);
      filter.$or = [
        { name: pattern },
        { sku: pattern },
        { barcode: pattern },
        { description: pattern },
      ];
    }

    const [documents, total] = await Promise.all([
      Product.find(filter)
        .select(POS_PRODUCT_FIELDS)
        .sort({ name: 1, _id: 1 })
        .skip((input.page - 1) * input.pageSize)
        .limit(input.pageSize)
        .lean<LeanPosProduct[]>(),
      Product.countDocuments(filter),
    ]);

    return {
      products: documents.map((document) =>
        toPosProduct(document, categoryById.get(String(document.category))?.name ?? ""),
      ),
      total,
      page: input.page,
      pageSize: input.pageSize,
      totalPages: Math.ceil(total / input.pageSize),
      categories: categoryOptions,
    };
  } catch (error) {
    throw toDatabaseError(error);
  }
}