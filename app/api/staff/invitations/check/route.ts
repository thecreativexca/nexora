import type { NextRequest } from "next/server";

import { clientKey, invitationLimiter } from "@/lib/security/rate-limit";
import { checkInvitation } from "@/lib/services/invitation.service";
import { TooManyRequestsError, validationError } from "@/lib/utils/errors";
import { readJsonBody, toErrorResponse, toSuccessResponse } from "@/lib/utils/http";
import { invitationCheckSchema } from "@/lib/validations/staff";

/**
 * Public invite lookup used by the "I have a code" step of the join form.
 * Throttled; returns only safe values (no hashes, no internal ids).
 */
export async function POST(request: NextRequest) {
  const parsedBody = await readJsonBody(request, "POST /api/staff/invitations/check invalid JSON");
  if ("error" in parsedBody) return parsedBody.error;

  const parsed = invitationCheckSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return toErrorResponse(validationError(parsed.error), "POST /api/staff/invitations/check invalid body");
  }

  const decision = invitationLimiter.check(clientKey(request, "invitation-check"));
  if (!decision.allowed) {
    return toErrorResponse(
      new TooManyRequestsError(undefined, decision.retryAfterSeconds),
      "POST /api/staff/invitations/check rate limited",
    );
  }

  try {
    const invitation = await checkInvitation(parsed.data);
    return toSuccessResponse({ invitation });
  } catch (error) {
    return toErrorResponse(error, "POST /api/staff/invitations/check failed");
  }
}