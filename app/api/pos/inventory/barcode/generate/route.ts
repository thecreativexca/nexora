import { requireStaffApi } from "@/lib/auth/staff-session";
import { STAFF_PERMISSION } from "@/lib/constants/staff";
import { generateInternalBarcode } from "@/lib/services/barcode.service";
import { ForbiddenError } from "@/lib/utils/errors";
import { toErrorResponse, toSuccessResponse } from "@/lib/utils/http";

export async function POST() {
  try {
    const staff = await requireStaffApi();
    const allowed =
      staff.effectivePermissions.includes(STAFF_PERMISSION.INVENTORY_CREATE) ||
      staff.effectivePermissions.includes(STAFF_PERMISSION.INVENTORY_UPDATE);
    if (!allowed) throw new ForbiddenError("You are not authorized to generate product barcodes.");
    return toSuccessResponse({ barcode: await generateInternalBarcode(), format: "CODE128" });
  } catch (error) {
    return toErrorResponse(error, "POST /api/pos/inventory/barcode/generate failed");
  }
}
