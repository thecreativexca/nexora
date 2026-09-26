import { destroyCustomerSession } from "@/lib/auth/customer-session";
import { toSuccessResponse } from "@/lib/utils/http";

/** Revokes the session server-side and clears the cookie. Safe to call twice. */
export async function POST() {
  await destroyCustomerSession();
  return toSuccessResponse({ ok: true });
}
