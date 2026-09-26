import "server-only";

import { cache } from "react";
import type { Types } from "mongoose";

import { connectDB } from "@/lib/db/mongodb";
import { ensureRequestTime } from "@/lib/db/request-time";
import { toDatabaseError } from "@/lib/services/service-errors";
import { Product } from "@/models/Product";
import { Category } from "@/models/Category";
import type { CategorySummary } from "@/types/catalog";

interface LeanCategory {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  description?: string;
  image?: string;
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

    return categories.map((category) => ({
      id: String(category._id),
      name: category.name,
      slug: category.slug,
      description: category.description ?? "",
      image: category.image ?? "",
      productCount: countByCategory.get(String(category._id)) ?? 0,
    }));
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
  return categories.find((category) => category.slug === slug) ?? null;
}

/** Header/navigation helper - an unavailable database must not break the shell. */
export async function listActiveCategoriesSafe(): Promise<CategorySummary[]> {
  try {
    return await listActiveCategories();
  } catch {
    return [];
  }
}
