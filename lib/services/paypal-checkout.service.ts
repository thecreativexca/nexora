import "server-only";

import { randomUUID } from "node:crypto";
import mongoose, { Types } from "mongoose";

import { mergeCartDraftLines } from "@/lib/cart/cart-lines";
import { AUDIT_ACTION } from "@/lib/constants/audit";
import { ORDER_CHANNEL, ORDER_NUMBER_MAX_ATTEMPTS, ORDER_STATUS, PAYMENT_METHOD, PAYMENT_STATUS } from "@/lib/constants/order";
import { connectDB } from "@/lib/db/mongodb";
import { capturePayPalOrder, completedCapture, createPayPalOrder, getPayPalCurrency, paypalAmountToMinorUnits, refundPayPalCapture } from "@/lib/payments/paypal";
import { recordAudit } from "@/lib/services/audit.service";
import { InvalidRequestError, NotFoundError, OutOfStockError, ProductUnavailableError } from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";
import { generateOrderNumber } from "@/lib/utils/order-number";
import { normalizeEmail, normalizePhone } from "@/lib/validations/common";
import type { CheckoutPayload } from "@/lib/validations/order";
import { CheckoutSession, type CheckoutSessionDocument, type CheckoutSessionItem } from "@/models/CheckoutSession";
import { Order } from "@/models/Order";
import { Product } from "@/models/Product";

const RESERVATION_MS = 15 * 60 * 1000;

async function restoreInventory(checkoutId: Types.ObjectId, terminalStatus: "FAILED" | "CANCELLED" | "EXPIRED") {
  const dbSession = await mongoose.startSession();
  try {
    await dbSession.withTransaction(async () => {
      const checkout = await CheckoutSession.findOneAndUpdate(
        { _id: checkoutId, status: { $in: ["RESERVED", "PROCESSING"] }, inventoryReleasedAt: null },
        { $set: { status: terminalStatus, inventoryReleasedAt: new Date() } },
        { session: dbSession, returnDocument: "before" },
      );
      if (!checkout) return;
      for (const item of checkout.items) if (!item.isService) {
        await Product.updateOne({ _id: item.productId }, { $inc: { stock: item.quantity } }, { session: dbSession });
      }
    });
  } finally { await dbSession.endSession(); }
}

export async function releaseExpiredCheckoutReservations(limit = 50) {
  await connectDB();
  const expired = await CheckoutSession.find({ status: "RESERVED", expiresAt: { $lte: new Date() }, inventoryReleasedAt: null }).select("_id").limit(limit).lean<Array<{ _id: Types.ObjectId }>>();
  for (const row of expired) await restoreInventory(row._id, "EXPIRED");
  return expired.length;
}

export async function beginPayPalCheckout(payload: CheckoutPayload, customerId: string | null) {
  await connectDB(); await releaseExpiredCheckoutReservations(20);
  const requested = mergeCartDraftLines(payload.items);
  const products = await Product.find({ _id: { $in: requested.map((line) => new Types.ObjectId(line.productId)) } })
    .select("name sku image priceInPaise stock isService isActive").lean<Array<{ _id: Types.ObjectId; name: string; sku: string; image?: string; priceInPaise: number; stock: number; isService?: boolean; isActive?: boolean }>>();
  const byId = new Map(products.map((product) => [String(product._id), product]));
  const items: CheckoutSessionItem[] = [];
  for (const line of requested) {
    const product = byId.get(line.productId);
    if (!product) throw new NotFoundError("An item in your bag no longer exists.");
    if (product.isActive === false) throw new ProductUnavailableError(`${product.name} is no longer available.`);
    if (!product.isService && product.stock < line.quantity) throw new OutOfStockError(`Only ${product.stock} of ${product.name} are available.`);
    items.push({ productId: product._id, productName: product.name, sku: product.sku, image: product.image ?? "", quantity: line.quantity, unitPriceInPaise: product.priceInPaise, lineTotalInPaise: product.priceInPaise * line.quantity, isService: Boolean(product.isService) });
  }
  const totalInPaise = items.reduce((sum, item) => sum + item.lineTotalInPaise, 0);
  if (totalInPaise <= 0) throw new InvalidRequestError("The order total must be greater than zero.");
  const sessionId = randomUUID(); const expiresAt = new Date(Date.now() + RESERVATION_MS); const dbSession = await mongoose.startSession();
  let checkout: CheckoutSessionDocument & { _id: Types.ObjectId };
  try {
    checkout = await dbSession.withTransaction(async () => {
      for (const item of items) if (!item.isService) {
        const result = await Product.updateOne({ _id: item.productId, isActive: true, isService: false, stock: { $gte: item.quantity } }, { $inc: { stock: -item.quantity } }, { session: dbSession });
        if (!result.modifiedCount) throw new OutOfStockError(`${item.productName} was just reserved by another customer.`);
      }
      const [created] = await CheckoutSession.create([{ sessionId, customerId: customerId && Types.ObjectId.isValid(customerId) ? new Types.ObjectId(customerId) : null,
        customerName: payload.customerName, customerEmail: normalizeEmail(payload.customerEmail), customerPhone: normalizePhone(payload.customerPhone), deliveryAddress: payload.address,
        items, subtotalInPaise: totalInPaise, totalInPaise, currency: getPayPalCurrency(), status: "RESERVED", notes: payload.notes, expiresAt }], { session: dbSession });
      return created;
    }) as CheckoutSessionDocument & { _id: Types.ObjectId };
  } finally { await dbSession.endSession(); }
  try {
    const paypal = await createPayPalOrder({ sessionId, amountInPaise: totalInPaise, description: `Nexora checkout ${sessionId}` });
    if (!paypal.id) throw new Error("PayPal did not create an order.");
    await CheckoutSession.updateOne({ _id: checkout._id, status: "RESERVED" }, { $set: { paypalOrderId: paypal.id } });
    await recordAudit({ actorStaffId: null, action: AUDIT_ACTION.PAYPAL_ORDER_CREATED, metadata: { checkoutSessionId: sessionId, paypalOrderId: paypal.id, amountInPaise: totalInPaise, currency: getPayPalCurrency() } });
    return { sessionId, paypalOrderId: paypal.id, expiresAt: expiresAt.toISOString() };
  } catch (error) {
    await restoreInventory(checkout._id, "FAILED"); logger.error("PayPal order creation failed", error, { checkoutSessionId: sessionId }); throw new InvalidRequestError("PayPal is unavailable right now. Your reserved items were released; please try again.");
  }
}

async function finalizedResult(checkout: CheckoutSessionDocument) {
  if (!checkout.orderId) throw new InvalidRequestError("Payment was recorded but the order reference is unavailable.");
  const order = await Order.findById(checkout.orderId).select("orderNumber").lean<{ orderNumber: string } | null>();
  if (!order) throw new InvalidRequestError("Payment was recorded but the order could not be loaded.");
  return { orderNumber: order.orderNumber, replayed: true };
}

export async function completePayPalCheckout(sessionId: string, paypalOrderId: string) {
  await connectDB();
  let checkout = await CheckoutSession.findOne({ sessionId, paypalOrderId });
  if (!checkout) throw new NotFoundError("This checkout session was not found.");
  if (checkout.status === "COMPLETED") return finalizedResult(checkout);
  if (checkout.status !== "RESERVED" && checkout.status !== "PROCESSING") throw new InvalidRequestError("This checkout session can no longer be used.");
  if (checkout.status === "RESERVED" && checkout.expiresAt <= new Date()) { await restoreInventory(checkout._id, "EXPIRED"); throw new InvalidRequestError("Your inventory reservation expired. Please return to checkout."); }
  if (checkout.status === "RESERVED") {
    const claimed = await CheckoutSession.findOneAndUpdate({ _id: checkout._id, status: "RESERVED" }, { $set: { status: "PROCESSING" } }, { returnDocument: "after" });
    if (!claimed) throw new InvalidRequestError("This payment is already being processed.");
    checkout = claimed;
  }

  let captureResponse;
  try { captureResponse = await capturePayPalOrder(paypalOrderId, sessionId); }
  catch (error) { logger.error("PayPal capture returned an ambiguous failure", error, { sessionId, paypalOrderId }); throw new InvalidRequestError("We could not confirm the payment yet. Do not pay again; retry confirmation in a moment."); }
  const capture = completedCapture(captureResponse);
  if (!capture) { await restoreInventory(checkout._id, "FAILED"); await recordAudit({ actorStaffId: null, action: AUDIT_ACTION.PAYPAL_PAYMENT_FAILED, metadata: { sessionId, paypalOrderId, providerStatus: captureResponse.status } }); throw new InvalidRequestError("PayPal did not complete the payment. Your items were released."); }
  const amount = paypalAmountToMinorUnits(capture.amount.value); const currency = capture.amount.currency_code.toUpperCase();
  if (amount !== checkout.totalInPaise || currency !== checkout.currency) {
    logger.error("PayPal capture amount mismatch", new Error("Verified amount mismatch"), { sessionId, paypalOrderId, captureId: capture.id, expectedAmount: checkout.totalInPaise, receivedAmount: amount, expectedCurrency: checkout.currency, receivedCurrency: currency });
    try { await refundPayPalCapture(capture.id, `mismatch-${sessionId}`); await restoreInventory(checkout._id, "FAILED"); } catch (refundError) { logger.error("Automatic mismatch refund requires reconciliation", refundError, { sessionId, captureId: capture.id }); }
    throw new InvalidRequestError("Payment verification failed. Any captured funds are being reconciled; contact support before retrying.");
  }

  const dbSession = await mongoose.startSession();
  try {
    let orderNumber = "";
    for (let attempt = 0; attempt < ORDER_NUMBER_MAX_ATTEMPTS; attempt++) {
      orderNumber = generateOrderNumber();
      try {
        await dbSession.withTransaction(async () => {
          checkout = await CheckoutSession.findOne({ _id: checkout!._id }).session(dbSession);
          if (!checkout) throw new NotFoundError();
          if (checkout.status === "COMPLETED") return;
          if (checkout.status !== "PROCESSING") throw new InvalidRequestError("This checkout has already been closed.");
          const [order] = await Order.create([{ orderNumber, channel: ORDER_CHANNEL.ONLINE, status: ORDER_STATUS.ORDER_PLACED, paymentMethod: PAYMENT_METHOD.PAYPAL, paymentStatus: PAYMENT_STATUS.PAID,
            paypalOrderId, paypalCaptureId: capture.id, currency, customerId: checkout.customerId, customerName: checkout.customerName, customerEmail: checkout.customerEmail,
            customerPhone: checkout.customerPhone, deliveryAddress: checkout.deliveryAddress, items: checkout.items, subtotalInPaise: checkout.subtotalInPaise, discountInPaise: 0, taxInPaise: 0,
            totalInPaise: checkout.totalInPaise, refundedTotalInPaise: 0, refunds: [], notes: checkout.notes, placedByStaffId: null }], { session: dbSession });
          checkout.status = "COMPLETED"; checkout.paypalCaptureId = capture.id; checkout.orderId = order._id; await checkout.save({ session: dbSession });
        });
        break;
      } catch (error) {
        if ((error as { code?: number }).code === 11000 && attempt + 1 < ORDER_NUMBER_MAX_ATTEMPTS) continue;
        throw error;
      }
    }
    const done = await CheckoutSession.findById(checkout._id);
    if (!done || done.status !== "COMPLETED") throw new Error("Order finalization did not commit.");
    const result = await finalizedResult(done);
    await recordAudit({ actorStaffId: null, action: AUDIT_ACTION.PAYPAL_PAYMENT_CAPTURED, metadata: { orderNumber: result.orderNumber, paypalOrderId, paypalCaptureId: capture.id, amountInPaise: amount, currency } });
    return { ...result, replayed: false };
  } finally { await dbSession.endSession(); }
}

export async function cancelPayPalCheckout(sessionId: string, paypalOrderId: string) {
  await connectDB(); const checkout = await CheckoutSession.findOne({ sessionId, paypalOrderId });
  if (checkout?.status === "RESERVED") await restoreInventory(checkout._id, "CANCELLED");
}
