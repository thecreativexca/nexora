import { requirePermissionApi } from "@/lib/auth/staff-session";
import { STAFF_PERMISSION } from "@/lib/constants/staff";
import { createInStoreOrder } from "@/lib/services/order.service";
import { toErrorResponse, toSuccessResponse, readJsonBody } from "@/lib/utils/http";
import { validationError } from "@/lib/utils/errors";
import { posSaleRequestSchema } from "@/lib/validations/pos";

/**
 * POS register checkout (staff only).
 *
 * - Requires ACCESS_REGISTER (any staff role).
 * - Totals are recomputed server-side; the client only sends item ids and qtys.
 * - Idempotency key maps a retried submit to the already-completed sale.
 */
export async function POST(request: Request) {
  let staff: Awaited<ReturnType<typeof requirePermissionApi>>;
  try {
    staff = await requirePermissionApi(STAFF_PERMISSION.ACCESS_REGISTER);
  } catch (error) {
    return toErrorResponse(error, "POST /api/pos/sales auth");
  }

  const read = await readJsonBody(request, "POST /api/pos/sales malformed body");
  if ("error" in read) return read.error;

  const parsed = posSaleRequestSchema.safeParse(read.body);
  if (!parsed.success) {
    return toErrorResponse(
      validationError(parsed.error, "Review the current sale and try again."),
      "POST /api/pos/sales invalid payload",
    );
  }

  try {
    const receipt = await createInStoreOrder(parsed.data, staff);
    return toSuccessResponse({ receipt }, 201);
  } catch (error) {
    return toErrorResponse(error, "POST /api/pos/sales failed");
  }
}