import type { NextRequest } from "next/server";

import { createStaffEntry } from "@/lib/auth/staff-entry";
import { staffRoleRequiresMfa } from "@/lib/constants/staff";
import { clientKey, invitationLimiter } from "@/lib/security/rate-limit";
import { acceptInvitation } from "@/lib/services/invitation.service";
import { TooManyRequestsError, validationError } from "@/lib/utils/errors";
import { readJsonBody, toErrorResponse, toSuccessResponse } from "@/lib/utils/http";
import { invitationAcceptSchema } from "@/lib/validations/staff";
import type { StaffAuthResult } from "@/types/staff";

/**
 * Public invitation acceptance: creates the account atomically with consuming
 * the one-time code, then signs the new joiner in (Cashier -> session now,
 * Manager -> MFA setup before a session is issued).
 */
export async function POST(request: NextRequest) {
  const parsedBody = await readJsonBody(request, "POST /api/staff/invitations/accept invalid JSON");
  if ("error" in parsedBody) return parsedBody.error;

  const parsed = invitationAcceptSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return toErrorResponse(validationError(parsed.error), "POST /api/staff/invitations/accept invalid body");
  }

  const decision = invitationLimiter.check(clientKey(request, "invitation-accept"));
  if (!decision.allowed) {
    return toErrorResponse(
      new TooManyRequestsError(undefined, decision.retryAfterSeconds),
      "POST /api/staff/invitations/accept rate limited",
    );
  }

  try {
    const { staff, role } = await acceptInvitation(parsed.data);

    // A freshly accepted account never has MFA enabled yet, so a Manager
    // joining this way goes straight to MFA setup.
    const state: StaffAuthResult = {
      staff,
      nextStep: staffRoleRequiresMfa(role) ? "MFA_VERIFY" : "COMPLETE",
    };
    const entry = await createStaffEntry(state);

    return toSuccessResponse(entry, 201);
  } catch (error) {
    return toErrorResponse(error, "POST /api/staff/invitations/accept failed");
  }
}