import { connection } from "next/server";

/**
 * Marks the current render/request as request-time.
 *
 * Retail data (stock, prices, orders) must never be baked into a build-time
 * static render, and the build must not require a reachable database. Every
 * catalog/order read helper calls this before querying MongoDB.
 */
export async function ensureRequestTime(): Promise<void> {
  // Service-level integration tests and maintenance scripts run outside the
  // Next.js request runtime. They already execute dynamically and must not call
  // `connection()`, which is only valid while Next is handling a request.
  if (!process.env.NEXT_RUNTIME) return;
  await connection();
}
