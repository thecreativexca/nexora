import "server-only";

import * as OTPAuth from "otpauth";

/**
 * TOTP (RFC 6238) helpers powered by `otpauth`.
 *
 * Compatible with Google Authenticator, Authy, 1Password, Microsoft
 * Authenticator and any standard TOTP app. Codes are 6 digits, 30s period, and
 * validation allows a small ±1-step clock drift window.
 */

export const TOTP_ISSUER = "Nexora POS";
export const TOTP_DIGITS = 6;
export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_CLOCK_WINDOW = 1;

/** Random Base32 secret (RFC 4648). */
export function generateSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

/** otpauth:// URI used to build the scanning QR code. */
export function buildOtpauthUri(secret: string, accountName: string): string {
  const totp = new OTPAuth.TOTP({
    issuer: TOTP_ISSUER,
    label: accountName,
    algorithm: "SHA1",
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD_SECONDS,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  return totp.toString();
}

/**
 * Validates a TOTP code. Returns true only for well-formed 6-digit codes that
 * match within the allowed drift window. Malformed, expired and wrong codes all
 * fail closed.
 */
export function verifyTotpCode(secret: string, token: string): boolean {
  if (!/^\d{6}$/.test(token)) return false;
  try {
    const totp = new OTPAuth.TOTP({
      algorithm: "SHA1",
      digits: TOTP_DIGITS,
      period: TOTP_PERIOD_SECONDS,
      secret: OTPAuth.Secret.fromBase32(secret),
    });
    const delta = totp.validate({ token, window: TOTP_CLOCK_WINDOW });
    return delta !== null;
  } catch {
    return false;
  }
}

/**
 * Generates the current TOTP code for a secret. Used by tests and by the setup
 * confirmation flow to prove end-to-end correctness - never exposed to clients.
 */
export function generateTotpCode(secret: string): string {
  const totp = new OTPAuth.TOTP({
    algorithm: "SHA1",
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD_SECONDS,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  return totp.generate();
}