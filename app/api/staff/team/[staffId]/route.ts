import type { NextRequest } from "next/server";

import { requirePermissionApi } from "@/lib/auth/staff-session";
import { STAFF_PERMISSION, type StaffPermission } from "@/lib/constants/staff";
import { changeStaffRole, setStaffActive, setStaffPermissions } from "@/lib/services/staff.service";
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
 * Activate / deactivate an account, change role, or configure permissions.
 *
 * Permission rules live in the service (off the client-controlled body):
 * nobody touches Super-Admin accounts, nobody acts on themselves, a Manager
 * only manages Seller accounts, and only an Admin may change roles/permissions.
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
    if (parsed.data.permissionGrants !== undefined || parsed.data.permissionDenies !== undefined) {
      updated = await setStaffPermissions(
        actor,
        staffId,
        (parsed.data.permissionGrants ?? []) as StaffPermission[],
        (parsed.data.permissionDenies ?? []) as StaffPermission[],
      );
    }

    if (!updated) {
      throw new InvalidRequestError("Nothing to change.");
    }

    return toSuccessResponse({ staff: updated });
  } catch (error) {
    return toErrorResponse(error, "PATCH /api/staff/team/[staffId] failed");
  }
}