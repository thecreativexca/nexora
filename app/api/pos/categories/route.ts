import type { NextRequest } from "next/server";

import { requirePermissionApi } from "@/lib/auth/staff-session";
import { STAFF_PERMISSION } from "@/lib/constants/staff";
import {
  createCategory,
  listAllCategoriesForStaff,
} from "@/lib/services/category.service";
import { parseJsonBody, toErrorResponse, toSuccessResponse } from "@/lib/utils/http";
import { validationError } from "@/lib/utils/errors";
import { categoryCreateSchema } from "@/lib/validations/pos";

/**
 * Staff categories collection endpoint.
 * GET: Lists all categories (active and inactive) with real product counts.
 * POST: Creates a new category (requires INVENTORY_CREATE permission).
 */
export async function GET() {
  try {
    await requirePermissionApi(STAFF_PERMISSION.ACCESS_INVENTORY);
  } catch (error) {
    return toErrorResponse(error, "GET /api/pos/categories auth");
  }

  try {
    const categories = await listAllCategoriesForStaff();
    return toSuccessResponse(categories);
  } catch (error) {
    return toErrorResponse(error, "GET /api/pos/categories failed");
  }
}

export async function POST(request: NextRequest) {
  let staff;
  try {
    staff = await requirePermissionApi(STAFF_PERMISSION.INVENTORY_CREATE);
  } catch (error) {
    return toErrorResponse(error, "POST /api/pos/categories auth");
  }

  const parsedBody = await parseJsonBody(request);
  if ("error" in parsedBody) return parsedBody.error;
  const parsed = categoryCreateSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return toErrorResponse(
      validationError(parsed.error, "Check the category name and details."),
      "POST /api/pos/categories invalid payload",
    );
  }

  try {
    const created = await createCategory(parsed.data, staff);
    return toSuccessResponse(created, 201);
  } catch (error) {
    return toErrorResponse(error, "POST /api/pos/categories failed");
  }
}
