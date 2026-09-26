import type { NextRequest } from "next/server";

import { listActiveCategories } from "@/lib/services/category.service";
import { listProducts } from "@/lib/services/product.service";
import { toErrorResponse, toSuccessResponse } from "@/lib/utils/http";
import { catalogQuerySchema, toCatalogQuery } from "@/lib/validations/catalog-query";
import { validationError } from "@/lib/utils/errors";

/**
 * Public catalogue API.
 *
 * - Only active products in active categories are returned.
 * - Search input is escaped before it reaches a regular expression.
 * - Query parameters are validated with Zod; invalid input is rejected.
 *
 * Used by the storefront search suggestions and available to any client.
 */
export async function GET(request: NextRequest) {
  const rawParams: Record<string, string> = {};
  for (const [key, value] of request.nextUrl.searchParams.entries()) {
    rawParams[key] = value;
  }

  const parsed = catalogQuerySchema.safeParse(rawParams);
  if (!parsed.success) {
    return toErrorResponse(
      validationError(parsed.error, "Check the query parameters and try again."),
      "GET /api/products invalid query",
    );
  }

  try {
    const query = toCatalogQuery(parsed.data);
    const [categories, result] = await Promise.all([
      listActiveCategories(),
      listProducts(query),
    ]);

    return toSuccessResponse({
      ...result,
      category: categories.find((item) => item.slug === query.categorySlug) ?? null,
    });
  } catch (error) {
    return toErrorResponse(error, "GET /api/products failed");
  }
}
