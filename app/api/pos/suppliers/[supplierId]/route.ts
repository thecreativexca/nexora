import type { NextRequest } from "next/server";

import { requirePermissionApi } from "@/lib/auth/staff-session";
import { STAFF_PERMISSION } from "@/lib/constants/staff";
import {
  getSupplierById,
  updateSupplier,
} from "@/lib/services/supplier.service";
import { parseJsonBody, toErrorResponse, toSuccessResponse } from "@/lib/utils/http";
import { NotFoundError, validationError } from "@/lib/utils/errors";
import { supplierUpdateSchema } from "@/lib/validations/pos";

interface RouteParams {
  params: Promise<{ supplierId: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    await requirePermissionApi(STAFF_PERMISSION.ACCESS_INVENTORY);
  } catch (error) {
    return toErrorResponse(error, "GET /api/pos/suppliers/[supplierId] auth");
  }

  const { supplierId } = await params;
  try {
    const supplier = await getSupplierById(supplierId);
    if (!supplier) {
      return toErrorResponse(
        new NotFoundError("Supplier not found."),
        "GET /api/pos/suppliers/[supplierId] not found",
      );
    }

    return toSuccessResponse(supplier);
  } catch (error) {
    return toErrorResponse(error, "GET /api/pos/suppliers/[supplierId] failed");
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  let staff;
  try {
    staff = await requirePermissionApi(STAFF_PERMISSION.INVENTORY_UPDATE);
  } catch (error) {
    return toErrorResponse(error, "PUT /api/pos/suppliers/[supplierId] auth");
  }

  const { supplierId } = await params;
  const parsedBody = await parseJsonBody(request);
  if ("error" in parsedBody) return parsedBody.error;
  const parsed = supplierUpdateSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return toErrorResponse(
      validationError(parsed.error, "Check the supplier fields and try again."),
      "PUT /api/pos/suppliers/[supplierId] invalid payload",
    );
  }

  try {
    const updated = await updateSupplier(supplierId, parsed.data, staff);
    return toSuccessResponse(updated);
  } catch (error) {
    return toErrorResponse(error, "PUT /api/pos/suppliers/[supplierId] failed");
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  let staff;
  try {
    staff = await requirePermissionApi(STAFF_PERMISSION.INVENTORY_ARCHIVE);
  } catch (error) {
    return toErrorResponse(error, "DELETE /api/pos/suppliers/[supplierId] auth");
  }

  const { supplierId } = await params;
  try {
    // Soft deactivate/archive supplier to preserve historical purchase records
    const updated = await updateSupplier(supplierId, { isActive: false }, staff);
    return toSuccessResponse(updated);
  } catch (error) {
    return toErrorResponse(error, "DELETE /api/pos/suppliers/[supplierId] failed");
  }
}
