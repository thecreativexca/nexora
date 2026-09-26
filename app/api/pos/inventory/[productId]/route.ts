import { requirePermissionApi } from "@/lib/auth/staff-session";
import { STAFF_PERMISSION } from "@/lib/constants/staff";
import { updateInventoryProduct } from "@/lib/services/inventory.service";
import { toErrorResponse, toSuccessResponse, readJsonBody } from "@/lib/utils/http";
import { validationError } from "@/lib/utils/errors";
import { inventoryProductUpdateSchema } from "@/lib/validations/pos";

/**
 * Update a single inventory product (manager/super-admin only).
 *
 * PATCH - targeted update: only supplied fields are written, so a stale form
 * can never overwrite the stock a cashier changed meanwhile.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ productId: string }> },
) {
  let staff: Awaited<ReturnType<typeof requirePermissionApi>>;
  try {
    staff = await requirePermissionApi(STAFF_PERMISSION.ACCESS_INVENTORY);
  } catch (error) {
    return toErrorResponse(error, "PATCH /api/pos/inventory auth");
  }

  const { productId } = await params;

  const read = await readJsonBody(request, "PATCH /api/pos/inventory malformed body");
  if ("error" in read) return read.error;

  const parsed = inventoryProductUpdateSchema.safeParse(read.body);
  if (!parsed.success) {
    return toErrorResponse(
      validationError(parsed.error, "Review the form and try again."),
      "PATCH /api/pos/inventory invalid payload",
    );
  }

  try {
    const product = await updateInventoryProduct(productId, parsed.data, staff);
    return toSuccessResponse({ product });
  } catch (error) {
    return toErrorResponse(error, "PATCH /api/pos/inventory failed");
  }
}