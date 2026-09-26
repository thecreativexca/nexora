import mongoose from "mongoose";
import { ORDER_STATUS, PAYMENT_STATUS, REFUND_STATUS } from "@/lib/constants/order";
import { connectDB } from "@/lib/db/mongodb";
import { verifyPayPalWebhook } from "@/lib/payments/paypal";
import { completePayPalCheckout } from "@/lib/services/paypal-checkout.service";
import { logger } from "@/lib/utils/logger";
import { CheckoutSession } from "@/models/CheckoutSession";
import { Order } from "@/models/Order";
import { PayPalWebhookEvent } from "@/models/PayPalWebhookEvent";
import { Product } from "@/models/Product";

interface WebhookEvent { id?: string; event_type?: string; resource?: { id?: string; supplementary_data?: { related_ids?: { order_id?: string } } }; }

async function reconcileExternalRefund(captureId: string) {
  const session = await mongoose.startSession();
  try { await session.withTransaction(async () => {
    const order = await Order.findOne({ paypalCaptureId: captureId }).session(session);
    if (!order || order.status === ORDER_STATUS.REFUNDED || order.refundedTotalInPaise > 0) return;
    for (const item of order.items) if (!item.isService) await Product.updateOne({ _id: item.productId }, { $inc: { stock: item.quantity } }, { session });
    order.status = ORDER_STATUS.REFUNDED; order.paymentStatus = PAYMENT_STATUS.REFUNDED; order.refundedTotalInPaise = order.totalInPaise;
    order.refunds.push({ amountInPaise: order.totalInPaise, reason: "Refund reconciled from PayPal webhook", status: REFUND_STATUS.COMPLETED, processedByStaffId: null, processedAt: new Date(), createdAt: new Date(), updatedAt: new Date() });
    await order.save({ session });
  }); } finally { await session.endSession(); }
}

export async function POST(request: Request) {
  let event: WebhookEvent;
  try { event = await request.json() as WebhookEvent; } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!event.id || !event.event_type) return Response.json({ error: "Invalid event" }, { status: 400 });
  try {
    if (!(await verifyPayPalWebhook(request.headers, event))) return Response.json({ error: "Invalid signature" }, { status: 401 });
    await connectDB(); if (await PayPalWebhookEvent.exists({ eventId: event.id })) return Response.json({ received: true, duplicate: true });
    if (event.event_type === "PAYMENT.CAPTURE.COMPLETED") {
      const paypalOrderId = event.resource?.supplementary_data?.related_ids?.order_id;
      if (paypalOrderId) { const checkout = await CheckoutSession.findOne({ paypalOrderId }).select("sessionId").lean<{ sessionId: string } | null>(); if (checkout) await completePayPalCheckout(checkout.sessionId, paypalOrderId); }
    } else if (event.event_type === "PAYMENT.CAPTURE.REFUNDED" && event.resource?.id) {
      await reconcileExternalRefund(event.resource.id);
    }
    await PayPalWebhookEvent.create({ eventId: event.id, eventType: event.event_type, processedAt: new Date() });
    return Response.json({ received: true });
  } catch (error) { logger.error("PayPal webhook processing failed", error, { eventId: event.id, eventType: event.event_type }); return Response.json({ error: "Webhook processing failed" }, { status: 500 }); }
}
