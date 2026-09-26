/**
 * Customer account + authentication constants.
 *
 * Kept in one place so the cookie name, lifetime and password policy cannot
 * drift between the registration form, the API handlers and the session layer.
 */

/** HttpOnly cookie carrying the opaque customer session token. */
export const CUSTOMER_SESSION_COOKIE = "nexora_customer_session";

/** Sessions are valid for 30 days from the last sign-in. */
export const CUSTOMER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** bcrypt is designed around a 72-byte input; reject longer secrets up front. */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 72;
export const BCRYPT_ROUNDS = 12;

/** Generic message used for every failed sign-in attempt. */
export const INVALID_CREDENTIALS_MESSAGE = "Invalid email or password.";
