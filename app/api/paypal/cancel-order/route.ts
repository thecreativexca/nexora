import { NextResponse } from "next/server";

/**
 * This route has been decommissioned as part of Phase 1 (offline payment migration).
 * Returns 410 Gone to signal permanent removal.
 */
export async function POST() {
  return NextResponse.json(
    { error: "PayPal payments are no longer supported." },
    { status: 410 },
  );
}
