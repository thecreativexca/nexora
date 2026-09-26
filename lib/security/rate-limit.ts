import "server-only";

/**
 * Application-level rate limiting (Phase 3 foundation).
 *
 * This is an in-memory, per-process sliding-window limiter - appropriate for a
 * single-instance deployment and for development. It is NOT a distributed /
 * multi-instance limiter: in production behind a load balancer, add a shared
 * store (e.g. Redis / Upstash) or a platform rate limit in front of the staff
 * endpoints. See README "Rate limiting" for the recommendation.
 */

interface Bucket {
  timestamps: number[];
  blockedUntil: number | null;
}

interface RateLimiterOptions {
  /** Sliding window length in ms. */
  windowMs: number;
  /** Maximum number of calls allowed within the window. */
  max: number;
  /** After exceeding `max`, block for this long (ms). Defaults to `windowMs`. */
  blockMs?: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

const buckets = new Map<string, Bucket>();

function now(): number {
  return Date.now();
}

export function createInMemoryRateLimiter(options: RateLimiterOptions) {
  const { windowMs, max } = options;
  const blockMs = options.blockMs ?? windowMs;

  function check(key: string): RateLimitDecision {
    const time = now();
    let bucket = buckets.get(key);

    if (!bucket || (bucket.blockedUntil !== null && bucket.blockedUntil <= time)) {
      bucket = { timestamps: [], blockedUntil: null };
      buckets.set(key, bucket);
    }

    if (bucket.blockedUntil !== null) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((bucket.blockedUntil - time) / 1000),
      );
      return { allowed: false, retryAfterSeconds };
    }

    bucket.timestamps = bucket.timestamps.filter(
      (timestamp) => timestamp > time - windowMs,
    );

    if (bucket.timestamps.length >= max) {
      bucket.blockedUntil = time + blockMs;
      const retryAfterSeconds = Math.max(1, Math.ceil(blockMs / 1000));
      return { allowed: false, retryAfterSeconds };
    }

    bucket.timestamps.push(time);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  return { check };
}

/**
 * Best-effort request fingerprint. Uses the real client IP when available
 * behind a single trusted proxy; falls back to a fixed local key in dev.
 */
export function clientKey(
  request: Request,
  suffix?: string,
): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
  return suffix ? `${ip}:${suffix}` : ip;
}

/** Staff login: 10 attempts per IP+email per 15 minutes, then a 15 min block. */
export const staffLoginLimiter = createInMemoryRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  blockMs: 15 * 60 * 1000,
});

/** MFA verification: 8 attempts per 10 minutes, then a 10 min block. */
export const staffMfaVerifyLimiter = createInMemoryRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 8,
  blockMs: 10 * 60 * 1000,
});

/** Invitation check/accept: 25 attempts per 15 minutes. */
export const invitationLimiter = createInMemoryRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 25,
  blockMs: 15 * 60 * 1000,
});