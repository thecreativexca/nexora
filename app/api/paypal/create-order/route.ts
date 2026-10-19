import { NextResponse } from "next/server";

/**
 * This route has been decommissioned as part of Phase 1 (offline payment migration).
 * PayPal online payments are no longer accepted.
 *
 * Returns 410 Gone to signal permanent removal to any lingering external callers.
 */
export async function POST() {
  return NextResponse.json(
    { error: "PayPal payments are no longer supported. This store uses offline payment only." },
    { status: 410 },
  );
}
