import { NextResponse } from "next/server";

/**
 * PayPal webhook handler - decommissioned in Phase 1 (offline payment migration).
 *
 * Returns 200 OK so PayPal stops retrying (a non-2xx would cause PayPal to
 * keep sending the same event). Historical webhook events in PayPalWebhookEvent
 * collection remain intact for audit purposes.
 */
export async function POST() {
  return NextResponse.json({ received: true, status: "decommissioned" }, { status: 200 });
}
