import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  decodeOAuthState,
  fetchOAuthIdentity,
  resolveOAuthCustomer,
  type OAuthProvider,
} from "@/lib/auth/customer-oauth";
import { createCustomerSession } from "@/lib/auth/customer-session";
import { AUDIT_ACTION } from "@/lib/constants/audit";
import { recordAudit } from "@/lib/services/audit.service";
import { logger } from "@/lib/utils/logger";

const STATE_COOKIE = "nexora_oauth_state";

function providerOf(value: string): OAuthProvider | null {
  return value === "google" ? value : null;
}

/** Only relative in-app paths are honoured (prevents open redirects). */
function safeNext(value: string): string {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/account";
}

function redirectTo(request: Request, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, request.url), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: rawProvider } = await params;
  const provider = providerOf(rawProvider);
  const url = new URL(request.url);
  const jar = await cookies();
  const stateCookie = jar.get(STATE_COOKIE)?.value;

  // The cookie is scoped to the callback path, so it must be deleted with the
  // same path or the browser keeps the stale value.
  if (provider) {
    jar.delete({ name: STATE_COOKIE, path: `/api/account/oauth/${provider}/callback` });
  }

  if (!provider) {
    return redirectTo(request, "/account/login?oauth=unsupported");
  }

  const providerError = url.searchParams.get("error");
  if (providerError || !stateCookie) {
    return redirectTo(
      request,
      `/account/login?oauth=${providerError === "access_denied" ? "cancelled" : "failed"}`,
    );
  }

  try {
    const state = decodeOAuthState(stateCookie);
    if (state.provider !== provider || state.state !== url.searchParams.get("state")) {
      throw new Error("The OAuth state did not match this callback.");
    }

    const code = url.searchParams.get("code");
    if (!code) throw new Error("The OAuth callback did not include an authorization code.");

    const identity = await fetchOAuthIdentity(provider, code, state.verifier);
    const customerId = await resolveOAuthCustomer(provider, identity);
    await createCustomerSession(customerId);
    await recordAudit({
      actorStaffId: null,
      action: AUDIT_ACTION.CUSTOMER_SOCIAL_LOGIN,
      metadata: { customerId, provider },
    });

    return redirectTo(request, safeNext(state.next));
  } catch (error) {
    logger.error("Google OAuth callback failed", error);
    return redirectTo(request, "/account/login?oauth=failed");
  }
}
