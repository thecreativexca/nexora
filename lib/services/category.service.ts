import "server-only";

import { cache } from "react";
import { Types } from "mongoose";

import { AUDIT_ACTION } from "@/lib/constants/audit";
import { connectDB } from "@/lib/db/mongodb";
import { ensureRequestTime } from "@/lib/db/request-time";
import { recordAudit } from "@/lib/services/audit.service";
import { toDatabaseError } from "@/lib/services/service-errors";
import { NotFoundError, InvalidRequestError } from "@/lib/utils/errors";
import { slugify } from "@/lib/utils/slug";
import { Product } from "@/models/Product";
import { Category } from "@/models/Category";
import type { CategorySummary } from "@/types/catalog";
import type { StaffView } from "@/types/staff";

interface LeanCategory {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  description?: string;
  image?: string;
  isActive?: boolean;
}

function canonicalCategoryIdentity(category: Pick<LeanCategory, "name" | "slug">) {
  const s = category.slug.toLowerCase();
  const n = category.name.trim().toLowerCase();
  if (
    s === "moblie" ||
    n === "moblie" ||
    s === "mobile" ||
    n === "mobile" ||
    s === "iphone" ||
    n === "iphone"
  ) {
    return { name: "iPhone", slug: "iphone" };
  }
  return { name: category.name, slug: category.slug };
}

async function loadActiveCategories(): Promise<CategorySummary[]> {
  await ensureRequestTime();

  try {
    await connectDB();

    const categories = await Category.find({ isActive: true })
      .select("name slug description image")
      .sort({ name: 1 })
      .lean<LeanCategory[]>();

    if (categories.length === 0) return [];

    // One aggregation instead of N count queries.
    const counts = await Product.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { isActive: true } },
      { $group: { _id: "$category", count: { $sum: 1 } } },
    ]);
    const countByCategory = new Map(counts.map((row) => [String(row._id), row.count]));

    return categories.map((category) => {
      const identity = canonicalCategoryIdentity(category);
      const isCellphone = identity.slug === "cellphones" || category.slug === "cellphones";
      const image = isCellphone && (!category.image || category.image.includes("iphone"))
        ? "/images/products/samsung-galaxy-s24-ultra.jpg"
        : (category.image ?? "");

      return {
        id: String(category._id),
        name: identity.name,
        slug: identity.slug,
        description: category.description ?? "",
        image,
        productCount: countByCategory.get(String(category._id)) ?? 0,
      };
    });
  } catch (error) {
    throw toDatabaseError(error);
  }
}

/** Request-scoped memoisation: layouts, pages and services share one query. */
export const listActiveCategories = cache(loadActiveCategories);

export async function getActiveCategoryBySlug(
  slug: string,
): Promise<CategorySummary | null> {
  const categories = await listActiveCategories();
  const lower = slug.toLowerCase();
  const requested = lower === "moblie" || lower === "mobile" ? "iphone" : lower;
  return categories.find((category) => category.slug.toLowerCase() === requested) ?? null;
}

/** Header/navigation helper - an unavailable database must not break the shell. */
export async function listActiveCategoriesSafe(): Promise<CategorySummary[]> {
  try {
    return await listActiveCategories();
  } catch {
    return [];
  }
}

/* ---------------------------------------------------------------------------
 * Staff Category Management (Phase 3)
 * ------------------------------------------------------------------------- */

export interface StaffCategoryView {
  id: string;
  name: string;
  slug: string;
  description: string;
  image: string;
  isActive: boolean;
  productCount: number;
}

export async function listAllCategoriesForStaff(): Promise<StaffCategoryView[]> {
  await ensureRequestTime();

  try {
    await connectDB();
    const categories = await Category.find().sort({ name: 1 }).lean<LeanCategory[]>();

    const counts = await Product.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $group: { _id: "$category", count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c) => [String(c._id), c.count]));

    return categories.map((c) => {
      const identity = canonicalCategoryIdentity(c);
      const isCellphone = identity.slug === "cellphones" || c.slug === "cellphones";
      const image = isCellphone && (!c.image || c.image.includes("iphone"))
        ? "/images/products/samsung-galaxy-s24-ultra.jpg"
        : (c.image ?? "");

      return {
        id: String(c._id),
        name: identity.name,
        slug: identity.slug,
        description: c.description ?? "",
        image,
        isActive: c.isActive ?? true,
        productCount: countMap.get(String(c._id)) ?? 0,
      };
    });
  } catch (error) {
    throw toDatabaseError(error);
  }
}

export interface CategoryInput {
  name: string;
  description?: string;
  image?: string;
}

export async function createCategory(
  input: CategoryInput,
  actor: StaffView,
): Promise<StaffCategoryView> {
  await ensureRequestTime();

  try {
    await connectDB();
    const name = input.name.trim();
    const slug = slugify(name);

    const existing = await Category.findOne({ slug });
    if (existing) {
      throw new InvalidRequestError(`A category with name '${name}' already exists.`);
    }

    const created = await Category.create({
      name,
      slug,
      description: input.description?.trim() ?? "",
      image: input.image?.trim() ?? "",
      isActive: true,
    });

    await recordAudit({
      actorStaffId: actor.id,
      actorRole: actor.role,
      action: AUDIT_ACTION.CATEGORY_CREATED,
      resource: "Category",
      resourceId: String(created._id),
      metadata: { name: created.name, slug: created.slug },
    });

    return {
      id: String(created._id),
      name: created.name,
      slug: created.slug,
      description: created.description,
      image: created.image,
      isActive: created.isActive,
      productCount: 0,
    };
  } catch (error) {
    throw toDatabaseError(error);
  }
}

export async function updateCategory(
  id: string,
  input: Partial<CategoryInput> & { isActive?: boolean },
  actor: StaffView,
): Promise<StaffCategoryView> {
  if (!Types.ObjectId.isValid(id)) throw new NotFoundError("Category not found.");
  await ensureRequestTime();

  try {
    await connectDB();
    const patch: Record<string, unknown> = {};
    if (input.name) {
      patch.name = input.name.trim();
      patch.slug = slugify(input.name.trim());
    }
    if (input.description !== undefined) patch.description = input.description.trim();
    if (input.image !== undefined) patch.image = input.image.trim();
    if (input.isActive !== undefined) patch.isActive = input.isActive;

    const updated = await Category.findByIdAndUpdate(
      id,
      { $set: patch },
      { returnDocument: "after", runValidators: true },
    );
    if (!updated) throw new NotFoundError("Category not found.");

    await recordAudit({
      actorStaffId: actor.id,
      actorRole: actor.role,
      action: AUDIT_ACTION.CATEGORY_UPDATED,
      resource: "Category",
      resourceId: id,
      metadata: { changed: Object.keys(patch) },
    });

    const productCount = await Product.countDocuments({ category: updated._id });

    return {
      id: String(updated._id),
      name: updated.name,
      slug: updated.slug,
      description: updated.description,
      image: updated.image,
      isActive: updated.isActive,
      productCount,
    };
  } catch (error) {
    throw toDatabaseError(error);
  }
}
