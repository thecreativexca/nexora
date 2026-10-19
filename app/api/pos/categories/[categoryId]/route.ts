import type { NextRequest } from "next/server";

import { requirePermissionApi } from "@/lib/auth/staff-session";
import { STAFF_PERMISSION } from "@/lib/constants/staff";
import { updateCategory } from "@/lib/services/category.service";
import { parseJsonBody, toErrorResponse, toSuccessResponse } from "@/lib/utils/http";
import { validationError } from "@/lib/utils/errors";
import { categoryUpdateSchema } from "@/lib/validations/pos";

interface RouteParams {
  params: Promise<{ categoryId: string }>;
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  let staff;
  try {
    staff = await requirePermissionApi(STAFF_PERMISSION.INVENTORY_UPDATE);
  } catch (error) {
    return toErrorResponse(error, "PUT /api/pos/categories/[categoryId] auth");
  }

  const { categoryId } = await params;
  const parsedBody = await parseJsonBody(request);
  if ("error" in parsedBody) return parsedBody.error;
  const parsed = categoryUpdateSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return toErrorResponse(
      validationError(parsed.error, "Check the category updates and try again."),
      "PUT /api/pos/categories/[categoryId] invalid payload",
    );
  }

  try {
    const updated = await updateCategory(categoryId, parsed.data, staff);
    return toSuccessResponse(updated);
  } catch (error) {
    return toErrorResponse(error, "PUT /api/pos/categories/[categoryId] failed");
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  let staff;
  try {
    staff = await requirePermissionApi(STAFF_PERMISSION.INVENTORY_ARCHIVE);
  } catch (error) {
    return toErrorResponse(error, "DELETE /api/pos/categories/[categoryId] auth");
  }

  const { categoryId } = await params;

  try {
    // Soft deactivate/archive category to preserve historical product links
    const updated = await updateCategory(categoryId, { isActive: false }, staff);
    return toSuccessResponse(updated);
  } catch (error) {
    return toErrorResponse(error, "DELETE /api/pos/categories/[categoryId] failed");
  }
}
