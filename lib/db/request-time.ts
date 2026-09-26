import { connection } from "next/server";

/**
 * Marks the current render/request as request-time.
 *
 * Retail data (stock, prices, orders) must never be baked into a build-time
 * static render, and the build must not require a reachable database. Every
 * catalog/order read helper calls this before querying MongoDB.
 */
export async function ensureRequestTime(): Promise<void> {
  await connection();
}
