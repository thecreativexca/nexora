import type { NextRequest } from "next/server";

import { requirePermissionApi } from "@/lib/auth/staff-session";
import { STAFF_PERMISSION } from "@/lib/constants/staff";
import { createInvitation, listInvitations } from "@/lib/services/invitation.service";
import { validationError } from "@/lib/utils/errors";
import { readJsonBody, toErrorResponse, toSuccessResponse } from "@/lib/utils/http";
import { staffInvitationSchema } from "@/lib/validations/staff";

/** Lists all invitations (Team Access screen). */
export async function GET() {
  try {
    await requirePermissionApi(STAFF_PERMISSION.MANAGE_TEAM);
    const invitations = await listInvitations();
    return toSuccessResponse({ invitations });
  } catch (error) {
    return toErrorResponse(error, "GET /api/staff/invitations failed");
  }
}

/**
 * Creates a staff invitation and returns the one-time code. Only SUPER_ADMIN
 * may invite MANAGER; MANAGER may only invite CASHIER (service-enforced).
 */
export async function POST(request: NextRequest) {
  const parsedBody = await readJsonBody(request, "POST /api/staff/invitations invalid JSON");
  if ("error" in parsedBody) return parsedBody.error;

  const parsed = staffInvitationSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return toErrorResponse(validationError(parsed.error), "POST /api/staff/invitations invalid body");
  }

  try {
    const actor = await requirePermissionApi(STAFF_PERMISSION.MANAGE_TEAM);
    const result = await createInvitation(actor, parsed.data);
    return toSuccessResponse(result, 201);
  } catch (error) {
    return toErrorResponse(error, "POST /api/staff/invitations failed");
  }
}