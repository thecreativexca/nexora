import "server-only";

import { Types } from "mongoose";

import { AUDIT_ACTION } from "@/lib/constants/audit";
import { connectDB } from "@/lib/db/mongodb";
import { ensureRequestTime } from "@/lib/db/request-time";
import { recordAudit } from "@/lib/services/audit.service";
import { toDatabaseError } from "@/lib/services/service-errors";
import {
  CategoryNotFoundError,
  DuplicateSkuError,
  DuplicateSlugError,
  NotFoundError,
  ProductSaveFailedError,
  isAppError,
  isDuplicateKeyError,
} from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";
import { normalizeSearchTerm, buildContainsRegExp } from "@/lib/utils/search";
import { normalizeSku, slugify } from "@/lib/utils/slug";
import type { InventoryProductCreate, InventoryProductUpdate } from "@/lib/validations/pos";
import { Category } from "@/models/Category";
import { Product } from "@/models/Product";
import type {
  InventoryListResult,
  InventoryProduct,
  InventoryTypeFilter,
  PosCategoryOption,
} from "@/types/pos";
import type { StaffView } from "@/types/staff";

interface LeanCategoryRef {
  _id: Types.ObjectId;
  name: string;
}

interface LeanInventoryProduct {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  description: string;
  sku: string;
  priceInPaise: number;
  costInPaise: number;
  stock: number;
  category: Types.ObjectId;
  image: string;
  isActive: boolean;
  isFeatured: boolean;
  isService: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const INVENTORY_FIELDS =
  "name slug description sku priceInPaise costInPaise stock category image isActive isFeatured isService createdAt updatedAt";

async function loadCategories(): Promise<{ map: Map<string, LeanCategoryRef>; options: PosCategoryOption[] }> {
  const categories = await Category.find().select("name").sort({ name: 1 }).lean<LeanCategoryRef[]>();
  return {
    map: new Map(categories.map((category) => [String(category._id), category])),
    options: categories.map((category) => ({ id: String(category._id), name: category.name })),
  };
}

function toInventoryProduct(
  product: LeanInventoryProduct,
  categoryName: string,
): InventoryProduct {
  return {
    id: String(product._id),
    name: product.name,
    slug: product.slug,
    description: product.description ?? "",
    sku: product.sku,
    priceInPaise: product.priceInPaise,
    costInPaise: product.costInPaise ?? 0,
    stock: product.stock,
    categoryId: String(product.category),
    categoryName: categoryName || "Uncategorised",
    image: product.image ?? "",
    isActive: product.isActive,
    isFeatured: product.isFeatured,
    isService: product.isService,
    createdAt: new Date(product.createdAt).toISOString(),
    updatedAt: new Date(product.updatedAt).toISOString(),
  };
}

export interface ListInventoryInput {
  search: string;
  categoryId: string;
  active?: boolean;
  type?: InventoryTypeFilter;
  featured?: boolean;
  page: number;
  pageSize: number;
}

export async function listInventoryProducts(
  input: ListInventoryInput,
): Promise<InventoryListResult> {
  await ensureRequestTime();

  try {
    await connectDB();

    const { map: categoryByName, options } = await loadCategories();

    const filter: Record<string, unknown> = {};

    const term = normalizeSearchTerm(input.search);
    if (term) {
      const pattern = buildContainsRegExp(term);
      filter.$or = [{ name: pattern }, { sku: pattern }, { description: pattern }];
    }

    if (input.categoryId) {
      filter.category = new Types.ObjectId(input.categoryId);
    }

    if (input.active !== undefined) {
      filter.isActive = input.active;
    } else {
      filter.isActive = { $in: [true, false] };
    }

    if (input.type === "physical") filter.isService = false;
    if (input.type === "service") filter.isService = true;

    if (input.featured !== undefined) {
      filter.isFeatured = input.featured;
    }

    const [documents, total] = await Promise.all([
      Product.find(filter)
        .select(INVENTORY_FIELDS)
        .sort({ name: 1, _id: 1 })
        .skip((input.page - 1) * input.pageSize)
        .limit(input.pageSize)
        .lean<LeanInventoryProduct[]>(),
      Product.countDocuments(filter),
    ]);

    return {
      products: documents.map((document) =>
        toInventoryProduct(document, categoryByName.get(String(document.category))?.name ?? ""),
      ),
      total,
      page: input.page,
      pageSize: input.pageSize,
      totalPages: Math.ceil(total / input.pageSize),
      categories: options,
    };
  } catch (error) {
    throw toDatabaseError(error);
  }
}

async function findCategoryOrThrow(categoryId: string): Promise<{ _id: Types.ObjectId; name: string }> {
  if (!Types.ObjectId.isValid(categoryId)) {
    throw new CategoryNotFoundError("Choose a valid category.");
  }
  try {
    await connectDB();
    const category = await Category.findById(categoryId)
      .select("name")
      .lean<{ _id: Types.ObjectId; name: string } | null>();
    if (!category) throw new CategoryNotFoundError("The selected category does not exist.");
    return category;
  } catch (error) {
    if (isAppError(error)) throw error;
    throw toDatabaseError(error);
  }
}

/** Friendly pre-checks so the generic duplicate-key backstop is rarely hit. */
async function assertUniqueSlugAndSku(
  slug: string,
  sku: string,
  excludeProductId?: string,
): Promise<void> {
  const conditions: Array<Record<string, unknown>> = [{ slug }, { sku }];
  const existing = await Product.findOne({
    $or: conditions,
    ...(excludeProductId ? { _id: { $ne: new Types.ObjectId(excludeProductId) } } : {}),
  })
    .select("slug sku")
    .lean<{ slug: string; sku: string } | null>();

  if (existing?.slug === slug) throw new DuplicateSlugError();
  if (existing?.sku === sku) throw new DuplicateSkuError();
}

export async function createInventoryProduct(
  input: InventoryProductCreate,
  actor: StaffView,
): Promise<InventoryProduct> {
  await ensureRequestTime();

  try {
    await connectDB();
  } catch (error) {
    throw toDatabaseError(error);
  }

  const category = await findCategoryOrThrow(input.category);
  const categoryId = String(category._id);
  const categoryName = category.name;

  const slug = slugify(input.name);
  const sku = normalizeSku(input.sku);
  const isService = input.isService ?? false;

  try {
    await assertUniqueSlugAndSku(slug, sku);

    const image = input.image?.trim() ?? "";
    const document = await Product.create({
      name: input.name.trim(),
      slug,
      description: input.description ?? "",
      priceInPaise: input.priceInPaise,
      costInPaise: input.costInPaise ?? 0,
      sku,
      stock: input.stock ?? 0,
      category: new Types.ObjectId(categoryId),
      image,
      images: image ? [image] : [],
      isActive: input.isActive ?? true,
      isFeatured: input.isFeatured ?? false,
      isService,
    });

    await recordAudit({
      actorStaffId: actor.id,
      action: AUDIT_ACTION.PRODUCT_CREATED,
      metadata: { productId: String(document._id), sku, name: document.name },
    });

    return toInventoryProduct(
      document.toObject() as unknown as LeanInventoryProduct,
      categoryName,
    );
  } catch (error) {
    if (isAppError(error)) throw error;
    if (isDuplicateKeyError(error)) {
      const existing = await Product.findOne({ $or: [{ slug }, { sku }] })
        .select("slug sku")
        .lean<{ slug: string; sku: string } | null>()
        .catch(() => null);
      if (existing?.slug === slug) throw new DuplicateSlugError();
      if (existing?.sku === sku) throw new DuplicateSkuError();
      throw new DuplicateSkuError();
    }
    logger.error("Product create failed", error);
    throw new ProductSaveFailedError(undefined, error);
  }
}

export async function updateInventoryProduct(
  productId: string,
  input: InventoryProductUpdate,
  actor: StaffView,
): Promise<InventoryProduct> {
  if (!Types.ObjectId.isValid(productId)) {
    throw new NotFoundError("Product not found.");
  }

  await ensureRequestTime();

  try {
    await connectDB();
  } catch (error) {
    throw toDatabaseError(error);
  }

  const current = await Product.findById(productId)
    .select(INVENTORY_FIELDS)
    .lean<LeanInventoryProduct | null>();
  if (!current) throw new NotFoundError("Product not found.");

  const patch: Record<string, unknown> = {};

  if ("name" in input) {
    const name = input.name?.trim() ?? "";
    const slug = slugify(name);
    if (slug !== current.slug) {
      await assertUniqueSlugAndSku(slug, current.sku, productId);
      patch.slug = slug;
    }
    patch.name = name;
  }

  if ("sku" in input) {
    const sku = normalizeSku(input.sku ?? "");
    if (sku !== current.sku) {
      await assertUniqueSlugAndSku(current.slug, sku, productId);
    }
    patch.sku = sku;
  }

  if ("description" in input) {
    patch.description = input.description ?? "";
  }

  if ("priceInPaise" in input) {
    patch.priceInPaise = input.priceInPaise;
  }

  if ("costInPaise" in input) {
    patch.costInPaise = input.costInPaise;
  }

  if ("category" in input) {
    const category = await findCategoryOrThrow(input.category ?? "");
    patch.category = category._id;
  }

  if ("image" in input) {
    const image = input.image?.trim() ?? "";
    patch.image = image;
    patch.images = image ? [image] : [];
  }

  if ("isActive" in input) patch.isActive = input.isActive;
  if ("isFeatured" in input) patch.isFeatured = input.isFeatured;
  if ("isService" in input) patch.isService = input.isService;
  if ("stock" in input) patch.stock = input.stock;

  try {
    const updated = await Product.findByIdAndUpdate(
      productId,
      { $set: patch },
      { returnDocument: "after", runValidators: true },
    )
      .select(INVENTORY_FIELDS)
      .lean<LeanInventoryProduct | null>();
    if (!updated) throw new NotFoundError("Product not found.");

    const { map } = await loadCategories();
    const next = toInventoryProduct(updated, map.get(String(updated.category))?.name ?? "");

    const changed = [...Object.keys(patch)];
    if ("stock" in patch && patch.stock !== current.stock) {
      await recordAudit({
        actorStaffId: actor.id,
        action: AUDIT_ACTION.STOCK_ADJUSTED,
        metadata: {
          productId,
          sku: updated.sku,
          previousStock: current.stock,
          newStock: updated.stock,
          difference: updated.stock - current.stock,
        },
      });
    }

    if ("isActive" in patch && patch.isActive !== current.isActive) {
      await recordAudit({
        actorStaffId: actor.id,
        action: patch.isActive ? AUDIT_ACTION.PRODUCT_ACTIVATED : AUDIT_ACTION.PRODUCT_DEACTIVATED,
        metadata: { productId, sku: updated.sku },
      });
    }

    await recordAudit({
      actorStaffId: actor.id,
      action: AUDIT_ACTION.PRODUCT_UPDATED,
      metadata: { productId, sku: updated.sku, changed },
    });

    return next;
  } catch (error) {
    if (isAppError(error)) throw error;
    if (isDuplicateKeyError(error)) {
      const probableSlug = (patch.slug as string | undefined) ?? current.slug;
      const probableSku = (patch.sku as string | undefined) ?? current.sku;
      const existing = await Product.findOne({
        $or: [{ slug: probableSlug }, { sku: probableSku }],
        _id: { $ne: new Types.ObjectId(productId) },
      })
        .select("slug sku")
        .lean<{ slug: string; sku: string } | null>()
        .catch(() => null);
      if (existing?.slug === probableSlug) throw new DuplicateSlugError();
      throw new DuplicateSkuError();
    }
    logger.error("Product update failed", error);
    throw new ProductSaveFailedError(undefined, error);
  }
}