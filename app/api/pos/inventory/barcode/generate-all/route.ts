import { NextRequest } from "next/server";

import { requireStaffApi } from "@/lib/auth/staff-session";
import { ensureBarcodesForAllProducts } from "@/lib/services/barcode.service";
import { toErrorResponse, toSuccessResponse, readJsonBody } from "@/lib/utils/http";

export async function POST(request: NextRequest) {
  try {
    await requireStaffApi();

    let force = false;
    const body = await readJsonBody<{ force?: boolean }>(request);
    if ("body" in body && body.body?.force) {
      force = Boolean(body.body.force);
    }

    const result = await ensureBarcodesForAllProducts(force);
    return toSuccessResponse(result);
  } catch (error) {
    return toErrorResponse(error, "POST /api/pos/inventory/barcode/generate-all failed");
  }
}

export async function GET() {
  try {
    await requireStaffApi();
    const result = await ensureBarcodesForAllProducts(false);
    return toSuccessResponse(result);
  } catch (error) {
    return toErrorResponse(error, "GET /api/pos/inventory/barcode/generate-all failed");
  }
}
