import type { NextRequest } from "next/server";

import { createStaffEntry } from "@/lib/auth/staff-entry";
import { staffLoginLimiter, clientKey } from "@/lib/security/rate-limit";
import { authenticateStaff } from "@/lib/services/staff.service";
import {
  TooManyRequestsError,
  validationError,
} from "@/lib/utils/errors";
import { readJsonBody, toErrorResponse, toSuccessResponse } from "@/lib/utils/http";
import { staffLoginSchema } from "@/lib/validations/staff";

/**
 * Staff sign-in.
 *
 * Responses:
 * - Cashier:     200 { step: "COMPLETE", redirectTo: "/pos" } + session cookie
 * - Manager/SA:  200 { step: "MFA_VERIFY" | "MFA_SETUP", redirectTo } + pending cookie
 * Failures are generic (no user enumeration) and both brute-force throttled.
 */
export async function POST(request: NextRequest) {
  const parsedBody = await readJsonBody(request, "POST /api/staff/login invalid JSON");
  if ("error" in parsedBody) return parsedBody.error;

  const parsed = staffLoginSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return toErrorResponse(validationError(parsed.error), "POST /api/staff/login invalid body");
  }

  const key = clientKey(request, `login:${parsed.data.email}`);
  const decision = staffLoginLimiter.check(key);
  if (!decision.allowed) {
    return toErrorResponse(
      new TooManyRequestsError(undefined, decision.retryAfterSeconds),
      "POST /api/staff/login rate limited",
    );
  }

  try {
    const result = await authenticateStaff(parsed.data.email, parsed.data.password);
    const entry = await createStaffEntry(result);
    return toSuccessResponse(entry);
  } catch (error) {
    return toErrorResponse(error, "POST /api/staff/login failed");
  }
}