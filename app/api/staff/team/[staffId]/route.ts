import type { NextRequest } from "next/server";

import { requirePermissionApi } from "@/lib/auth/staff-session";
import { STAFF_PERMISSION } from "@/lib/constants/staff";
import { changeStaffRole, setStaffActive } from "@/lib/services/staff.service";
import {
  InvalidRequestError,
  validationError,
} from "@/lib/utils/errors";
import { readJsonBody, toErrorResponse, toSuccessResponse } from "@/lib/utils/http";
import { staffTeamActionSchema } from "@/lib/validations/staff";

interface RouteContext {
  params: Promise<{ staffId: string }>;
}

/**
 * Activate / deactivate an account or change its role.
 *
 * Permission rules live in the service (off the client-controlled body):
 * nobody touches Super-Admin accounts, nobody acts on themselves, a Manager
 * only manages Cashier accounts, and only a Super-Admin may change roles.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const parsedBody = await readJsonBody(request, "PATCH /api/staff/team/[staffId] invalid JSON");
  if ("error" in parsedBody) return parsedBody.error;

  const parsed = staffTeamActionSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return toErrorResponse(validationError(parsed.error), "PATCH /api/staff/team/[staffId] invalid body");
  }

  try {
    const actor = await requirePermissionApi(STAFF_PERMISSION.MANAGE_STAFF);

    const { staffId } = await params;
    if (parsed.data.staffId !== staffId) {
      throw new InvalidRequestError("The staff identifier in the body does not match this route.");
    }

    let updated;
    if (parsed.data.isActive !== undefined) {
      updated = await setStaffActive(actor, staffId, parsed.data.isActive);
    }
    if (parsed.data.role !== undefined) {
      updated = await changeStaffRole(actor, staffId, parsed.data.role);
    }

    if (!updated) {
      throw new InvalidRequestError("Nothing to change.");
    }

    return toSuccessResponse({ staff: updated });
  } catch (error) {
    return toErrorResponse(error, "PATCH /api/staff/team/[staffId] failed");
  }
}