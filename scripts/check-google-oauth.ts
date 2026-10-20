/**
 * Google OAuth configuration check.
 *
 * Usage:
 *   npm run check:google
 *
 * Prints the exact redirect URI that must be registered in the Google Cloud
 * console. Secret values are never printed - only whether they are present.
 */
import { loadEnvFiles } from "./load-env";

const loadedFiles = loadEnvFiles();

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

const appUrlValue = env("NEXT_PUBLIC_APP_URL").replace(/\/$/, "");
const authSecret = env("AUTH_SECRET");
const clientId = env("GOOGLE_CLIENT_ID");
const clientSecret = env("GOOGLE_CLIENT_SECRET");

let appUrl: URL | null = null;
try {
  appUrl = appUrlValue ? new URL(appUrlValue) : null;
} catch {
  appUrl = null;
}

const results: Array<{ ok: boolean; label: string; detail: string }> = [
  {
    ok: loadedFiles.length > 0,
    label: "Environment file",
    detail: loadedFiles.length > 0 ? loadedFiles.join(", ") : "no .env.local or .env file found",
  },
  {
    ok: appUrl !== null,
    label: "NEXT_PUBLIC_APP_URL",
    detail: appUrl ? appUrlValue : "missing or not a valid absolute URL",
  },
  {
    ok: authSecret.length >= 32,
    label: "AUTH_SECRET",
    detail:
      authSecret.length === 0
        ? "missing (generate at least 32 random characters)"
        : authSecret.length >= 32
          ? `${authSecret.length} characters`
          : `only ${authSecret.length} characters - at least 32 are required`,
  },
  {
    ok: clientId.length > 0,
    label: "GOOGLE_CLIENT_ID",
    detail: clientId.length > 0 ? "configured" : "missing",
  },
  {
    ok: clientSecret.length > 0,
    label: "GOOGLE_CLIENT_SECRET",
    detail: clientSecret.length > 0 ? "configured" : "missing",
  },
];

console.log("Google OAuth configuration check\n");
for (const result of results) {
  console.log(`  ${result.ok ? "ok  " : "FAIL"}  ${result.label}: ${result.detail}`);
}

if (clientId.length > 0 && !clientId.endsWith(".apps.googleusercontent.com")) {
  console.log(
    "\n  WARN  GOOGLE_CLIENT_ID does not look like a Google web client ID (usually ends with .apps.googleusercontent.com).",
  );
}

const redirectUri = `${appUrlValue || "http://localhost:3000"}/api/account/oauth/google/callback`;
console.log(`\nRedirect URI to register in Google Cloud Console:\n  ${redirectUri}`);

const failed = results.filter((result) => !result.ok).length;
if (failed > 0) {
  console.log(
    "\nSetup steps:\n" +
      "  1. Open https://console.cloud.google.com/apis/credentials\n" +
      "  2. Create an OAuth client ID of type \"Web application\".\n" +
      `  3. Add ${redirectUri} under \"Authorised redirect URIs\".\n` +
      "  4. Put the client ID and secret in .env.local, then restart the dev server.\n",
  );
  process.exitCode = 1;
} else {
  console.log("\nAll required Google OAuth values are configured. Restart the dev server if you just changed them.\n");
}
