import type { NextRequest } from "next/server";

import { requirePermissionApi } from "@/lib/auth/staff-session";
import { STAFF_PERMISSION } from "@/lib/constants/staff";
import { lookupProductByBarcodeOrSku } from "@/lib/services/inventory.service";
import { NotFoundError } from "@/lib/utils/errors";
import { toErrorResponse, toSuccessResponse } from "@/lib/utils/http";

interface RouteParams {
  params: Promise<{ code: string }>;
}

/**
 * Fast barcode/SKU scanner endpoint for the POS register.
 * Compatible with standard USB keyboard-wedge barcode scanners.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    await requirePermissionApi(STAFF_PERMISSION.ACCESS_REGISTER);
  } catch (error) {
    return toErrorResponse(error, "GET /api/pos/products/barcode/[code] auth");
  }

  const { code } = await params;
  const decoded = decodeURIComponent(code ?? "").trim();

  if (!decoded) {
    return toErrorResponse(
      new NotFoundError("Please scan or enter a valid barcode or SKU."),
      "GET /api/pos/products/barcode/[code] missing code",
    );
  }

  try {
    const product = await lookupProductByBarcodeOrSku(decoded);
    if (!product) {
      return toErrorResponse(
        new NotFoundError(`No product found matching barcode or SKU "${decoded}".`),
        "GET /api/pos/products/barcode/[code] not found",
      );
    }

    return toSuccessResponse(product);
  } catch (error) {
    return toErrorResponse(error, "GET /api/pos/products/barcode/[code] failed");
  }
}
