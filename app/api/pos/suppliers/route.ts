import type { NextRequest } from "next/server";

import { requirePermissionApi } from "@/lib/auth/staff-session";
import { STAFF_PERMISSION } from "@/lib/constants/staff";
import { createSupplier, listSuppliers } from "@/lib/services/supplier.service";
import { parseJsonBody, toErrorResponse, toSuccessResponse } from "@/lib/utils/http";
import { validationError } from "@/lib/utils/errors";
import { supplierCreateSchema } from "@/lib/validations/pos";

export async function GET(request: NextRequest) {
  try {
    await requirePermissionApi(STAFF_PERMISSION.ACCESS_INVENTORY);
  } catch (error) {
    return toErrorResponse(error, "GET /api/pos/suppliers auth");
  }

  const { searchParams } = request.nextUrl;
  const search = searchParams.get("search") ?? undefined;
  const activeParam = searchParams.get("active");
  const isActive = activeParam !== null ? activeParam === "true" : undefined;
  const page = searchParams.get("page") ? parseInt(searchParams.get("page")!, 10) : 1;
  const pageSize = searchParams.get("pageSize") ? parseInt(searchParams.get("pageSize")!, 10) : 50;

  try {
    const result = await listSuppliers({ search, isActive, page, pageSize });
    return toSuccessResponse(result);
  } catch (error) {
    return toErrorResponse(error, "GET /api/pos/suppliers failed");
  }
}

export async function POST(request: NextRequest) {
  let staff;
  try {
    staff = await requirePermissionApi(STAFF_PERMISSION.INVENTORY_CREATE);
  } catch (error) {
    return toErrorResponse(error, "POST /api/pos/suppliers auth");
  }

  const parsedBody = await parseJsonBody(request);
  if ("error" in parsedBody) return parsedBody.error;
  const parsed = supplierCreateSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return toErrorResponse(
      validationError(parsed.error, "Check the supplier details and try again."),
      "POST /api/pos/suppliers invalid payload",
    );
  }

  try {
    const created = await createSupplier(parsed.data, staff);
    return toSuccessResponse(created, 201);
  } catch (error) {
    return toErrorResponse(error, "POST /api/pos/suppliers failed");
  }
}
