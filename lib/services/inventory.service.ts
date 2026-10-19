import "server-only";

import { Types } from "mongoose";

import { AUDIT_ACTION } from "@/lib/constants/audit";
import { connectDB } from "@/lib/db/mongodb";
import { ensureRequestTime } from "@/lib/db/request-time";
import { recordAudit } from "@/lib/services/audit.service";
import { recordStockMovement } from "@/lib/services/stock-movement.service";
import { toDatabaseError } from "@/lib/services/service-errors";
import {
  CategoryNotFoundError,
  DuplicateSkuError,
  DuplicateSlugError,
  NotFoundError,
  InvalidRequestError,
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
import { STOCK_MOVEMENT_TYPE } from "@/models/StockMovement";
import { Supplier } from "@/models/Supplier";
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
  barcode?: string;
  priceInPaise: number;
  costInPaise: number;
  mrpInPaise?: number;
  taxRate?: number;
  unit?: string;
  minStockThreshold?: number;
  stock: number;
  category: Types.ObjectId;
  supplier?: Types.ObjectId | null;
  image: string;
  isActive: boolean;
  isFeatured: boolean;
  isService: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const INVENTORY_FIELDS =
  "name slug description sku barcode priceInPaise costInPaise mrpInPaise taxRate unit minStockThreshold stock category supplier image isActive isFeatured isService createdAt updatedAt";

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
  supplierName: string | null = null,
): InventoryProduct {
  const minThreshold = product.minStockThreshold ?? 5;
  const isLowStock = !product.isService && product.stock <= minThreshold;

  return {
    id: String(product._id),
    name: product.name,
    slug: product.slug,
    description: product.description ?? "",
    sku: product.sku,
    barcode: product.barcode ?? "",
    priceInPaise: product.priceInPaise,
    costInPaise: product.costInPaise ?? 0,
    mrpInPaise: product.mrpInPaise ?? product.priceInPaise,
    taxRate: product.taxRate ?? 0,
    unit: product.unit ?? "Piece",
    minStockThreshold: minThreshold,
    stock: product.stock,
    isLowStock,
    categoryId: String(product.category),
    categoryName: categoryName || "Uncategorised",
    supplierId: product.supplier ? String(product.supplier) : null,
    supplierName,
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
  lowStockOnly?: boolean;
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
      filter.$or = [
        { name: pattern },
        { sku: pattern },
        { barcode: pattern },
        { description: pattern },
      ];
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

    if (input.lowStockOnly) {
      filter.isService = false;
      filter.$expr = { $lte: ["$stock", { $ifNull: ["$minStockThreshold", 5] }] };
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

    // Load supplier names if any referenced
    const supplierIds = documents
      .map((document) => document.supplier)
      .filter((supplierId): supplierId is Types.ObjectId => supplierId instanceof Types.ObjectId);
    const suppliers = supplierIds.length > 0
      ? await Supplier.find({ _id: { $in: supplierIds } }).select("name").lean()
      : [];
    const supplierMap = new Map(suppliers.map((s) => [String(s._id), s.name]));

    return {
      products: documents.map((document) =>
        toInventoryProduct(
          document,
          categoryByName.get(String(document.category))?.name ?? "",
          document.supplier ? supplierMap.get(String(document.supplier)) ?? null : null,
        ),
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
async function assertUniqueSlugSkuAndBarcode(
  slug: string,
  sku: string,
  barcode?: string,
  excludeProductId?: string,
): Promise<void> {
  const conditions: Array<Record<string, unknown>> = [{ slug }, { sku }];
  if (barcode) {
    conditions.push({ barcode });
  }

  const existing = await Product.findOne({
    $or: conditions,
    ...(excludeProductId ? { _id: { $ne: new Types.ObjectId(excludeProductId) } } : {}),
  })
    .select("slug sku barcode")
    .lean<{ slug: string; sku: string; barcode?: string } | null>();

  if (existing?.slug === slug) throw new DuplicateSlugError();
  if (existing?.sku === sku) throw new DuplicateSkuError();
  if (barcode && existing?.barcode === barcode) {
    throw new InvalidRequestError(`Barcode '${barcode}' is already in use by another product.`);
  }
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
  const slug = slugify(input.name);
  const sku = normalizeSku(input.sku);
  const barcode = input.barcode ? input.barcode.trim().toUpperCase() : undefined;
  const isService = input.isService ?? false;

  try {
    await assertUniqueSlugSkuAndBarcode(slug, sku, barcode);

    const image = input.image?.trim() ?? "";
    const document = await Product.create({
      name: input.name.trim(),
      slug,
      description: input.description?.trim() ?? "",
      sku,
      barcode: barcode || undefined,
      priceInPaise: input.priceInPaise,
      costInPaise: input.costInPaise ?? 0,
      mrpInPaise: input.mrpInPaise ?? input.priceInPaise,
      taxRate: input.taxRate ?? 0,
      unit: input.unit?.trim() || "Piece",
      minStockThreshold: input.minStockThreshold ?? 5,
      stock: isService ? 0 : (input.stock ?? 0),
      category: category._id,
      supplier: input.supplier && Types.ObjectId.isValid(input.supplier) ? new Types.ObjectId(input.supplier) : null,
      image,
      images: image ? [image] : [],
      isActive: input.isActive ?? true,
      isFeatured: input.isFeatured ?? false,
      isService,
    });

    // Record initial stock in ledger if > 0
    if (document.stock > 0) {
      await recordStockMovement({
        productId: document._id,
        productName: document.name,
        sku: document.sku,
        movementType: STOCK_MOVEMENT_TYPE.ADJUSTMENT,
        quantityChange: document.stock,
        quantityBefore: 0,
        quantityAfter: document.stock,
        reason: "Initial stock on product creation",
        performedByStaffId: actor.id,
        performedByName: actor.name,
      });
    }

    await recordAudit({
      actorStaffId: actor.id,
      actorRole: actor.role,
      action: AUDIT_ACTION.PRODUCT_CREATED,
      resource: "Product",
      resourceId: String(document._id),
      metadata: { sku: document.sku, slug: document.slug },
    });

    return toInventoryProduct(document.toObject(), category.name);
  } catch (error) {
    if (isAppError(error)) throw error;
    if (isDuplicateKeyError(error)) {
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

  if ("name" in input && input.name) {
    const name = input.name.trim();
    const slug = slugify(name);
    if (slug !== current.slug) {
      await assertUniqueSlugSkuAndBarcode(slug, current.sku, current.barcode, productId);
      patch.slug = slug;
    }
    patch.name = name;
  }

  if ("sku" in input && input.sku) {
    const sku = normalizeSku(input.sku);
    if (sku !== current.sku) {
      await assertUniqueSlugSkuAndBarcode(current.slug, sku, current.barcode, productId);
    }
    patch.sku = sku;
  }

  if ("barcode" in input) {
    const barcode = input.barcode ? input.barcode.trim().toUpperCase() : undefined;
    if (barcode !== current.barcode) {
      await assertUniqueSlugSkuAndBarcode(current.slug, current.sku, barcode, productId);
    }
    patch.barcode = barcode || null;
  }

  if ("description" in input) patch.description = input.description ?? "";
  if ("priceInPaise" in input) patch.priceInPaise = input.priceInPaise;
  if ("costInPaise" in input) patch.costInPaise = input.costInPaise;
  if ("mrpInPaise" in input) patch.mrpInPaise = input.mrpInPaise;
  if ("taxRate" in input) patch.taxRate = input.taxRate;
  if ("unit" in input) patch.unit = input.unit;
  if ("minStockThreshold" in input) patch.minStockThreshold = input.minStockThreshold;

  if ("category" in input && input.category) {
    const category = await findCategoryOrThrow(input.category);
    patch.category = category._id;
  }

  if ("supplier" in input) {
    patch.supplier = input.supplier && Types.ObjectId.isValid(input.supplier) ? new Types.ObjectId(input.supplier) : null;
  }

  if ("image" in input) {
    const image = input.image?.trim() ?? "";
    patch.image = image;
    patch.images = image ? [image] : [];
  }

  if ("isActive" in input) patch.isActive = input.isActive;
  if ("isFeatured" in input) patch.isFeatured = input.isFeatured;
  if ("isService" in input) patch.isService = input.isService;

  if ("stock" in input && input.stock !== undefined) {
    if (input.stock < 0) throw new InvalidRequestError("Stock cannot be negative.");
    patch.stock = input.stock;
  }

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

    if ("stock" in patch && patch.stock !== current.stock) {
      const diff = Number(patch.stock) - current.stock;
      await recordStockMovement({
        productId: updated._id,
        productName: updated.name,
        sku: updated.sku,
        movementType: STOCK_MOVEMENT_TYPE.ADJUSTMENT,
        quantityChange: diff,
        quantityBefore: current.stock,
        quantityAfter: updated.stock,
        reason: "Manual stock edit in product details",
        performedByStaffId: actor.id,
        performedByName: actor.name,
      });

      await recordAudit({
        actorStaffId: actor.id,
        actorRole: actor.role,
        action: AUDIT_ACTION.STOCK_ADJUSTED,
        resource: "Product",
        resourceId: productId,
        metadata: {
          sku: updated.sku,
          previousStock: current.stock,
          newStock: updated.stock,
          difference: diff,
        },
      });
    }

    await recordAudit({
      actorStaffId: actor.id,
      actorRole: actor.role,
      action: AUDIT_ACTION.PRODUCT_UPDATED,
      resource: "Product",
      resourceId: productId,
      metadata: { sku: updated.sku, changed: Object.keys(patch) },
    });

    return next;
  } catch (error) {
    if (isAppError(error)) throw error;
    logger.error("Product update failed", error);
    throw new ProductSaveFailedError(undefined, error);
  }
}

/**
 * Dedicated stock adjustment with mandatory reason and ledger logging.
 * Prevents negative stock.
 */
export async function adjustProductStock(
  productId: string,
  quantityChange: number,
  reason: string,
  actor: StaffView,
): Promise<InventoryProduct> {
  if (!Types.ObjectId.isValid(productId)) throw new NotFoundError("Product not found.");
  if (quantityChange === 0) throw new InvalidRequestError("Quantity change cannot be zero.");

  await ensureRequestTime();

  try {
    await connectDB();
    const product = await Product.findById(productId);
    if (!product) throw new NotFoundError("Product not found.");

    if (product.isService) {
      throw new InvalidRequestError("Cannot adjust inventory for a service product.");
    }

    const previousStock = product.stock;
    const newStock = previousStock + quantityChange;

    if (newStock < 0) {
      throw new InvalidRequestError(
        `Cannot adjust stock by ${quantityChange}. Current stock is ${previousStock}, which would result in negative stock.`,
      );
    }

    product.stock = newStock;
    await product.save();

    await recordStockMovement({
      productId: product._id,
      productName: product.name,
      sku: product.sku,
      movementType: STOCK_MOVEMENT_TYPE.ADJUSTMENT,
      quantityChange,
      quantityBefore: previousStock,
      quantityAfter: newStock,
      reason: reason.trim(),
      performedByStaffId: actor.id,
      performedByName: actor.name,
    });

    await recordAudit({
      actorStaffId: actor.id,
      actorRole: actor.role,
      action: AUDIT_ACTION.STOCK_ADJUSTED,
      resource: "Product",
      resourceId: String(product._id),
      metadata: {
        sku: product.sku,
        previousStock,
        newStock,
        quantityChange,
        reason,
      },
    });

    const { map } = await loadCategories();
    return toInventoryProduct(product.toObject(), map.get(String(product.category))?.name ?? "");
  } catch (error) {
    throw toDatabaseError(error);
  }
}

/** Fast barcode / SKU lookup for USB barcode scanners */
export async function lookupProductByBarcodeOrSku(code: string) {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;

  await connectDB();
  const product = await Product.findOne({
    $or: [{ barcode: normalized }, { sku: normalized }],
    isActive: true,
  }).lean<LeanInventoryProduct | null>();

  if (!product) return null;

  const { map } = await loadCategories();
  return toInventoryProduct(product, map.get(String(product.category))?.name ?? "");
}
