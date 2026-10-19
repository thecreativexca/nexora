import { NextRequest } from "next/server";

import { requireStaffApi } from "@/lib/auth/staff-session";
import { isAdminRole } from "@/lib/constants/staff";
import { approveExpense } from "@/lib/services/expense.service";
import { BadRequestError, ForbiddenError } from "@/lib/utils/errors";
import { toErrorResponse, toSuccessResponse } from "@/lib/utils/http";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let staff: Awaited<ReturnType<typeof requireStaffApi>>;
  try {
    staff = await requireStaffApi();
    if (!isAdminRole(staff.role)) {
      throw new ForbiddenError("Only Administrators can approve or reject expenses.");
    }
  } catch (error) {
    return toErrorResponse(error, "PATCH /api/pos/expenses/[id] auth");
  }

  try {
    const { id } = await params;
    const body = (await request.json()) as { approved: boolean };
    if (typeof body?.approved !== "boolean") {
      throw new BadRequestError("Property 'approved' must be a boolean.");
    }

    const expense = await approveExpense(id, body.approved, staff);
    return toSuccessResponse({ expense });
  } catch (error) {
    return toErrorResponse(error, "PATCH /api/pos/expenses/[id] failed");
  }
}
