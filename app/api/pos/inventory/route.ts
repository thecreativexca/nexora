import type { NextRequest } from "next/server";

import { requirePermissionApi } from "@/lib/auth/staff-session";
import { STAFF_PERMISSION } from "@/lib/constants/staff";
import { INVENTORY_MAX_PAGE, INVENTORY_MAX_PAGE_SIZE, INVENTORY_PAGE_SIZE } from "@/lib/constants/pos";
import {
  createInventoryProduct,
  listInventoryProducts,
} from "@/lib/services/inventory.service";
import { toErrorResponse, toSuccessResponse, readJsonBody } from "@/lib/utils/http";
import { validationError } from "@/lib/utils/errors";
import { inventoryProductCreateSchema, inventoryQuerySchema } from "@/lib/validations/pos";

/**
 * Inventory management API (manager/super-admin only).
 *
 * GET  - paged, filterable product list including purchase cost + stock.
 * POST - create a new product (slug and SKU uniqueness enforced).
 */
export async function GET(request: NextRequest) {
  let staff: Awaited<ReturnType<typeof requirePermissionApi>>;
  try {
    staff = await requirePermissionApi(STAFF_PERMISSION.ACCESS_INVENTORY);
  } catch (error) {
    return toErrorResponse(error, "GET /api/pos/inventory auth");
  }
  void staff;

  const rawParams: Record<string, string> = {};
  for (const [key, value] of request.nextUrl.searchParams.entries()) {
    rawParams[key] = value;
  }

  const parsed = inventoryQuerySchema.safeParse(rawParams);
  if (!parsed.success) {
    return toErrorResponse(
      validationError(parsed.error, "Check the query parameters and try again."),
      "GET /api/pos/inventory invalid query",
    );
  }

  try {
    const { q, categoryId, active, type, featured, lowStockOnly, page, pageSize } = parsed.data;
    const result = await listInventoryProducts({
      search: q ?? "",
      categoryId: categoryId ?? "",
      active: active === undefined ? undefined : active === "true",
      type: type ?? undefined,
      featured: featured === undefined ? undefined : featured === "true",
      lowStockOnly: lowStockOnly === "true",
      page: page ? Math.min(Number(page), INVENTORY_MAX_PAGE) : 1,
      pageSize: pageSize ? Math.min(Number(pageSize), INVENTORY_MAX_PAGE_SIZE) : INVENTORY_PAGE_SIZE,
    });

    return toSuccessResponse(result);
  } catch (error) {
    return toErrorResponse(error, "GET /api/pos/inventory failed");
  }
}

export async function POST(request: Request) {
  let staff: Awaited<ReturnType<typeof requirePermissionApi>>;
  try {
    staff = await requirePermissionApi(STAFF_PERMISSION.INVENTORY_CREATE);
  } catch (error) {
    return toErrorResponse(error, "POST /api/pos/inventory auth");
  }

  const read = await readJsonBody(request, "POST /api/pos/inventory malformed body");
  if ("error" in read) return read.error;

  const parsed = inventoryProductCreateSchema.safeParse(read.body);
  if (!parsed.success) {
    return toErrorResponse(
      validationError(parsed.error, "Review the form and try again."),
      "POST /api/pos/inventory invalid payload",
    );
  }

  try {
    const product = await createInventoryProduct(parsed.data, staff);
    return toSuccessResponse({ product }, 201);
  } catch (error) {
    return toErrorResponse(error, "POST /api/pos/inventory failed");
  }
}
