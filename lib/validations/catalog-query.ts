import { z } from "zod";

import {
  CATALOG_PAGE_SIZE,
  CATALOG_SORTS,
  DEFAULT_CATALOG_SORT,
  SEARCH_MAX_LENGTH,
} from "@/lib/constants/catalog";
import { normalizeSearchTerm, normalizeSlug } from "@/lib/utils/search";
import type { CatalogQuery } from "@/types/catalog";

/** Strict schema for the public JSON API (invalid input is rejected). */
export const catalogQuerySchema = z.object({
  q: z.string().trim().max(SEARCH_MAX_LENGTH).optional(),
  category: z.string().trim().max(80).optional(),
  sort: z.enum(CATALOG_SORTS).optional(),
  featured: z.enum(["true", "false"]).optional(),
  page: z.string().regex(/^\d{1,4}$/, "Page must be a positive number.").optional(),
  pageSize: z.string().regex(/^\d{1,3}$/, "Page size must be a positive number.").optional(),
});

export type RawSearchParams = Record<string, string | string[] | undefined>;

const MAX_PAGE = 500;

/**
 * Lenient per-field schemas for page URLs: an invalid `sort` must not discard a
 * perfectly good search term, and a hand-edited URL must never throw.
 */
const searchTermInputSchema = z.string().trim().max(SEARCH_MAX_LENGTH);
const categorySlugInputSchema = z.string().trim().max(80);
const sortInputSchema = z.enum(CATALOG_SORTS);

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  max: number,
): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) return fallback;
  return parsed;
}

export function parseCatalogQuery(
  raw: RawSearchParams,
  overrides: Partial<CatalogQuery> = {},
): CatalogQuery {
  const term = searchTermInputSchema.safeParse(firstValue(raw.q) ?? "");
  const category = categorySlugInputSchema.safeParse(firstValue(raw.category) ?? "");
  const sort = sortInputSchema.safeParse(firstValue(raw.sort));

  return {
    search: term.success ? normalizeSearchTerm(term.data) : "",
    categorySlug: category.success ? normalizeSlug(category.data) : "",
    sort: sort.success ? sort.data : DEFAULT_CATALOG_SORT,
    page: boundedInteger(firstValue(raw.page), 1, MAX_PAGE),
    pageSize: boundedInteger(firstValue(raw.pageSize), CATALOG_PAGE_SIZE, 48),
    featuredOnly: firstValue(raw.featured) === "true",
    ...overrides,
  };
}

/** Builds a CatalogQuery from a validated API query object. */
export function toCatalogQuery(
  input: z.output<typeof catalogQuerySchema>,
): CatalogQuery {
  return {
    search: normalizeSearchTerm(input.q ?? ""),
    categorySlug: normalizeSlug(input.category ?? ""),
    sort: input.sort ?? DEFAULT_CATALOG_SORT,
    page: boundedInteger(input.page, 1, MAX_PAGE),
    pageSize: boundedInteger(input.pageSize, CATALOG_PAGE_SIZE, 48),
    featuredOnly: input.featured === "true",
  };
}
