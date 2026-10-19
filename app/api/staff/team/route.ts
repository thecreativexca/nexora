import type { NextRequest } from "next/server";

import { requirePermissionApi } from "@/lib/auth/staff-session";
import { STAFF_PERMISSION } from "@/lib/constants/staff";
import { createStaffMember, listStaff } from "@/lib/services/staff.service";
import { validationError } from "@/lib/utils/errors";
import { readJsonBody, toErrorResponse, toSuccessResponse } from "@/lib/utils/http";
import { staffCreateMemberSchema } from "@/lib/validations/staff";

/** Team Access screen: the staff directory. */
export async function GET() {
  try {
    await requirePermissionApi(STAFF_PERMISSION.MANAGE_TEAM);
    const staff = await listStaff();
    return toSuccessResponse({ staff });
  } catch (error) {
    return toErrorResponse(error, "GET /api/staff/team failed");
  }
}

/**
 * Creates a staff account directly with an initial password. Only an Admin may
 * add a Manager; a Manager may only add Sellers (service-enforced).
 */
export async function POST(request: NextRequest) {
  const parsedBody = await readJsonBody(request, "POST /api/staff/team invalid JSON");
  if ("error" in parsedBody) return parsedBody.error;

  const parsed = staffCreateMemberSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return toErrorResponse(validationError(parsed.error), "POST /api/staff/team invalid body");
  }

  try {
    const actor = await requirePermissionApi(STAFF_PERMISSION.MANAGE_TEAM);
    const staff = await createStaffMember(actor, parsed.data);
    return toSuccessResponse({ staff }, 201);
  } catch (error) {
    return toErrorResponse(error, "POST /api/staff/team failed");
  }
}
