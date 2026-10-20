import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { createOAuthAuthorization, type OAuthProvider } from "@/lib/auth/customer-oauth";
import { logger } from "@/lib/utils/logger";

const STATE_COOKIE = "nexora_oauth_state";

function providerOf(value: string): OAuthProvider | null {
  return value === "google" ? value : null;
}

/** Only relative in-app paths are honoured (prevents open redirects). */
function safeNext(value: string | null): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/account";
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
  const provider = providerOf((await params).provider);
  if (!provider) {
    return redirectTo(request, "/account/login?oauth=unsupported");
  }

  try {
    const auth = createOAuthAuthorization(
      provider,
      safeNext(new URL(request.url).searchParams.get("next")),
    );

    (await cookies()).set(STATE_COOKIE, auth.cookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: `/api/account/oauth/${provider}/callback`,
      maxAge: 600,
    });

    return NextResponse.redirect(auth.url, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logger.error("Could not start Google OAuth", error);
    return redirectTo(request, "/account/login?oauth=configuration");
  }
}
