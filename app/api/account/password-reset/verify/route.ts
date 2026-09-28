import { cookies } from "next/headers"; import { assertSameOrigin } from "@/lib/security/same-origin"; import { RESET_COOKIE, verifyPasswordResetOtp } from "@/lib/services/password-reset.service";
import { createCustomerSession } from "@/lib/auth/customer-session";
import { validationError } from "@/lib/utils/errors"; import { readJsonBody, toErrorResponse, toSuccessResponse } from "@/lib/utils/http"; import { verifyResetOtpSchema } from "@/lib/validations/customer";
export async function POST(request: Request) { try { assertSameOrigin(request); const body = await readJsonBody(request, "Reset verify JSON"); if ("error" in body) return body.error; const parsed = verifyResetOtpSchema.safeParse(body.body); if (!parsed.success) return toErrorResponse(validationError(parsed.error), "Reset verify body"); const { token, customerId } = await verifyPasswordResetOtp(parsed.data.email, parsed.data.otp);
// Correct OTP signs the customer in immediately (one-step login).
await createCustomerSession(customerId);
(await cookies()).set(RESET_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/api/account/password-reset", maxAge: 600 }); return toSuccessResponse({ verified: true }); } catch (error) { return toErrorResponse(error, "Password reset OTP failed"); } }
