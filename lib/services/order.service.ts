import "server-only";

import mongoose, { Types } from "mongoose";

import { mergeCartDraftLines } from "@/lib/cart/cart-lines";
import { AUDIT_ACTION } from "@/lib/constants/audit";
import {
  ORDER_CHANNEL,
  ORDER_NUMBER_MAX_ATTEMPTS,
  ORDER_STATUS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TONES,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS,
  PAYMENT_STATUS_LABELS,
  isActiveOrderStatus,
  type OrderChannel,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus,
} from "@/lib/constants/order";
import { connectDB } from "@/lib/db/mongodb";
import { ensureRequestTime } from "@/lib/db/request-time";
import { recordAudit } from "@/lib/services/audit.service";
import { toDatabaseError } from "@/lib/services/service-errors";
import {
  isAppError,
  isDuplicateKeyError,
  isTransactionUnsupportedError,
  InvalidRequestError,
  NotFoundError,
  OrderCreationFailedError,
  OutOfStockError,
  ProductUnavailableError,
  TransactionsUnsupportedError,
} from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";
import { generateOrderNumber, isWellFormedOrderNumber } from "@/lib/utils/order-number";
import { normalizeEmail, normalizePhone } from "@/lib/validations/common";
import type { CheckoutPayload } from "@/lib/validations/order";
import type { PosSaleRequest } from "@/lib/validations/pos";
import { Order, type OrderItemSnapshot } from "@/models/Order";
import { Product } from "@/models/Product";
import type {
  CustomerOrderSummary,
  OrderItemSnapshotView,
  OrderView,
  PlacedOrderSummary,
} from "@/types/order";
import type { PosReceipt, PosReceiptItem } from "@/types/pos";
import type { StaffView } from "@/types/staff";

interface LeanProductForOrder {
  _id: Types.ObjectId;
  name: string;
  sku: string;
  image?: string;
  priceInPaise: number;
  stock: number;
  isService?: boolean;
  isActive?: boolean;
}

interface LeanOrderItem {
  productId: Types.ObjectId;
  productName: string;
  sku: string;
  image?: string;
  quantity: number;
  unitPriceInPaise: number;
  lineTotalInPaise: number;
  isService?: boolean;
}

export interface LeanOrder {
  orderNumber: string;
  channel: OrderChannel;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  customerId?: Types.ObjectId | string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  deliveryAddress?: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  } | null;
  items: LeanOrderItem[];
  subtotalInPaise: number;
  discountInPaise?: number;
  taxInPaise?: number;
  totalInPaise: number;
  notes?: string;
  placedByName?: string;
  createdAt: Date;
}

function toItemView(item: LeanOrderItem): OrderItemSnapshotView {
  return {
    productId: String(item.productId),
    productName: item.productName,
    sku: item.sku,
    image: item.image ?? "",
    quantity: item.quantity,
    unitPriceInPaise: item.unitPriceInPaise,
    lineTotalInPaise: item.lineTotalInPaise,
    isService: Boolean(item.isService),
  };
}

/** Public, serialisable order shape - internal `_id`/`__v` never leave the server. */
export function toOrderView(order: LeanOrder): OrderView {
  const address = order.deliveryAddress;
  return {
    orderNumber: order.orderNumber,
    channel: order.channel,
    status: order.status,
    statusLabel: ORDER_STATUS_LABELS[order.status],
    statusTone: ORDER_STATUS_TONES[order.status],
    paymentMethod: order.paymentMethod,
    paymentMethodLabel: PAYMENT_METHOD_LABELS[order.paymentMethod],
    paymentStatus: order.paymentStatus,
    paymentStatusLabel: PAYMENT_STATUS_LABELS[order.paymentStatus],
    customerId: order.customerId ? String(order.customerId) : null,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    deliveryAddress: {
      line1: address?.line1 ?? "",
      line2: address?.line2 ?? "",
      city: address?.city ?? "",
      state: address?.state ?? "",
      postalCode: address?.postalCode ?? "",
      country: address?.country ?? "",
    },
    items: order.items.map(toItemView),
    subtotalInPaise: order.subtotalInPaise,
    discountInPaise: order.discountInPaise ?? 0,
    taxInPaise: order.taxInPaise ?? 0,
    totalInPaise: order.totalInPaise,
    itemCount: order.items.reduce((count, item) => count + item.quantity, 0),
    notes: order.notes ?? "",
    createdAt: new Date(order.createdAt).toISOString(),
  };
}

function toPlacedOrderSummary(order: LeanOrder): PlacedOrderSummary {
  return {
    orderNumber: order.orderNumber,
    status: order.status,
    statusLabel: ORDER_STATUS_LABELS[order.status],
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    totalInPaise: order.totalInPaise,
    itemCount: order.items.reduce((count, item) => count + item.quantity, 0),
    customerName: order.customerName,
    createdAt: new Date(order.createdAt).toISOString(),
  };
}

function toCustomerOrderSummary(order: LeanOrder): CustomerOrderSummary {
  return {
    orderNumber: order.orderNumber,
    status: order.status,
    statusLabel: ORDER_STATUS_LABELS[order.status],
    statusTone: ORDER_STATUS_TONES[order.status],
    paymentMethodLabel: PAYMENT_METHOD_LABELS[order.paymentMethod],
    paymentStatus: order.paymentStatus,
    paymentStatusLabel: PAYMENT_STATUS_LABELS[order.paymentStatus],
    totalInPaise: order.totalInPaise,
    itemCount: order.items.reduce((count, item) => count + item.quantity, 0),
    isActive: isActiveOrderStatus(order.status),
    createdAt: new Date(order.createdAt).toISOString(),
  };
}

/**
 * Receipt serialisation for a finished POS sale. Only sale-relevant data is
 * returned: product cost, sessions and database internals never leave here.
 */
function toPosReceipt(order: LeanOrder, fallbackStaffName: string, replayed: boolean): PosReceipt {
  const items: PosReceiptItem[] = order.items.map((item) => ({
    productId: String(item.productId),
    productName: item.productName,
    sku: item.sku,
    quantity: item.quantity,
    unitPriceInPaise: item.unitPriceInPaise,
    lineTotalInPaise: item.lineTotalInPaise,
    isService: Boolean(item.isService),
  }));

  return {
    orderNumber: order.orderNumber,
    status: order.status,
    statusLabel: ORDER_STATUS_LABELS[order.status],
    paymentMethod: order.paymentMethod,
    paymentMethodLabel: PAYMENT_METHOD_LABELS[order.paymentMethod],
    paymentStatus: order.paymentStatus,
    paymentStatusLabel: PAYMENT_STATUS_LABELS[order.paymentStatus],
    customerName: order.customerName.trim() ? order.customerName : null,
    customerEmail: order.customerEmail.trim() ? order.customerEmail : null,
    staffName: order.placedByName?.trim() || fallbackStaffName || null,
    items,
    subtotalInPaise: order.subtotalInPaise,
    totalInPaise: order.totalInPaise,
    itemCount: order.items.reduce((count, item) => count + item.quantity, 0),
    createdAt: new Date(order.createdAt).toISOString(),
    replayed,
  };
}

interface ResolvedOrderItems {
  items: OrderItemSnapshot[];
  /** Products that no longer exist at all - request is genuinely not-found. */
  missing: string[];
  /** Products that exist but are no longer buyable (deactivated/delisted). */
  unavailable: string[];
  insufficient: string[];
}

/**
 * Re-reads every requested line against MongoDB and produces historical item
 * snapshots. Shared by the online checkout and the POS register so the two
 * channels can never drift on pricing/stock availability rules.
 */
function buildOrderSnapshots(
  requestedLines: readonly { productId: string; quantity: number }[],
  products: readonly LeanProductForOrder[],
): ResolvedOrderItems {
  const productById = new Map(products.map((product) => [String(product._id), product]));
  const missing: string[] = [];
  const unavailable: string[] = [];
  const insufficient: string[] = [];
  const items: OrderItemSnapshot[] = [];

  for (const line of requestedLines) {
    const product = productById.get(line.productId);

    if (!product) {
      missing.push(line.productId);
      continue;
    }

    if (product.isActive === false) {
      unavailable.push(product.name);
      continue;
    }

    const isService = Boolean(product.isService);
    if (!isService && product.stock < line.quantity) {
      insufficient.push(`${product.name} (${product.stock} left)`);
      continue;
    }

    items.push({
      productId: product._id,
      productName: product.name,
      sku: product.sku,
      image: product.image ?? "",
      quantity: line.quantity,
      unitPriceInPaise: product.priceInPaise,
      lineTotalInPaise: product.priceInPaise * line.quantity,
      isService,
    });
  }

  return { items, missing, unavailable, insufficient };
}

/**
 * Atomically reserves physical stock inside a transaction. Services are never
 * decremented. The `stock >= quantity` condition makes overselling impossible;
 * because it runs inside the transaction a later failure rolls the decrement
 * back. Shared by the online checkout and the POS register.
 */
async function decrementPhysicalStock(
  items: readonly OrderItemSnapshot[],
  session: mongoose.ClientSession,
): Promise<void> {
  for (const item of items) {
    if (item.isService) continue;

    const reserved = await Product.findOneAndUpdate(
      {
        _id: item.productId,
        isActive: true,
        isService: false,
        stock: { $gte: item.quantity },
      },
      { $inc: { stock: -item.quantity } },
      { session },
    );

    if (!reserved) {
      throw new OutOfStockError(
        `Insufficient stock for ${item.productName} (${item.quantity} requested).`,
      );
    }
  }
}

/**
 * Places an ONLINE order.
 *
 * Security + integrity rules:
 * 1. Only product ids + quantities are taken from the browser; every price,
 *    SKU, name and stock value is re-read from MongoDB.
 * 2. Stock is decremented with a single conditional (`stock >= quantity`)
 *    atomic update, so two simultaneous checkouts cannot oversell.
 * 3. Inventory + order insert run inside one MongoDB transaction: a failure
 *    leaves no partial order and no partially decremented stock.
 *
 * `customerId` is supplied by the server (from the authenticated session), never
 * by the browser, so a request can never attach an order to another account.
 * Guest checkout passes `null` and stays fully supported.
 */
export async function createOnlineOrder(
  payload: CheckoutPayload,
  customerId: string | null = null,
): Promise<PlacedOrderSummary> {
  if (payload.paymentMethod) {
    throw new InvalidRequestError("Direct online order creation is disabled. Complete payment through PayPal.");
  }
  await ensureRequestTime();

  try {
    await connectDB();
  } catch (error) {
    throw toDatabaseError(error);
  }

  const requestedLines = mergeCartDraftLines(payload.items);

  let products: LeanProductForOrder[];
  try {
    products = await Product.find({
      _id: { $in: requestedLines.map((line) => new Types.ObjectId(line.productId)) },
    })
      .select("name sku image priceInPaise stock isService isActive")
      .lean<LeanProductForOrder[]>();
  } catch (error) {
    throw toDatabaseError(error);
  }

  const resolved = buildOrderSnapshots(requestedLines, products);

  if (resolved.missing.length > 0) {
    throw new NotFoundError(
      `Some items in your order are no longer available (${resolved.missing.join(", ")}).`,
    );
  }

  if (resolved.unavailable.length > 0) {
    throw new ProductUnavailableError(
      `These items are no longer available: ${resolved.unavailable.join(", ")}. Please remove them from your bag and try again.`,
    );
  }

  if (resolved.insufficient.length > 0) {
    throw new OutOfStockError(
      `Not enough stock for ${resolved.insufficient.join(", ")}. Please adjust the quantity and try again.`,
    );
  }

  // Server-side money maths only - browser prices/totals are never trusted.
  const subtotalInPaise = resolved.items.reduce((total, item) => total + item.lineTotalInPaise, 0);
  const discountInPaise = 0;
  const taxInPaise = 0;
  const totalInPaise = subtotalInPaise - discountInPaise + taxInPaise;

  const orderBase = {
    channel: ORDER_CHANNEL.ONLINE,
    status: ORDER_STATUS.ORDER_PLACED,
    paymentMethod: payload.paymentMethod,
    paymentStatus: PAYMENT_STATUS.PENDING,
    customerId:
      customerId && Types.ObjectId.isValid(customerId)
        ? new Types.ObjectId(customerId)
        : null,
    customerName: payload.customerName,
    customerEmail: normalizeEmail(payload.customerEmail),
    customerPhone: normalizePhone(payload.customerPhone),
    deliveryAddress: {
      line1: payload.address.line1,
      line2: payload.address.line2 ?? "",
      city: payload.address.city,
      state: payload.address.state,
      postalCode: payload.address.postalCode,
      country: payload.address.country,
    },
    items: resolved.items,
    subtotalInPaise,
    discountInPaise,
    taxInPaise,
    totalInPaise,
    refundedTotalInPaise: 0,
    refunds: [],
    notes: payload.notes ?? "",
    placedByStaffId: null,
  };

  for (let attempt = 0; attempt < ORDER_NUMBER_MAX_ATTEMPTS; attempt += 1) {
    const orderNumber = generateOrderNumber();
    const session = await mongoose.startSession();

    try {
      const created = await session.withTransaction(async () => {
        // 1. Atomically reserve physical stock. The `stock >= quantity`
        //    condition makes overselling impossible, and because it runs
        //    inside the transaction a later failure rolls the decrement back.
        await decrementPhysicalStock(resolved.items, session);

        // 2. Persist the order together with its historical item snapshots.
        const createdOrders = await Order.create([{ ...orderBase, orderNumber }], { session });
        return createdOrders[0];
      });

      const order = created.toObject() as unknown as LeanOrder;
      logger.info("Online order placed", {
        orderNumber: order.orderNumber,
        itemCount: order.items.length,
      });
      return toPlacedOrderSummary(order);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        logger.warn("Order number collision - retrying with a new number", { orderNumber });
        continue;
      }
      if (isTransactionUnsupportedError(error)) {
        throw new TransactionsUnsupportedError(undefined, error);
      }
      if (isAppError(error)) {
        throw error;
      }
      logger.error("Order creation failed", error, { orderNumber });
      throw new OrderCreationFailedError(undefined, error);
    } finally {
      await session.endSession();
    }
  }

  throw new OrderCreationFailedError(
    "We could not allocate an order number. Please try again.",
  );
}

/**
 * Completes an IN_STORE POS sale.
 *
 * - The authenticated staff member is taken from the session, never the body.
 * - Products are re-read from MongoDB: ids + quantities only are trusted.
 * - Physical stock is decremented with the SAME atomic conditional update the
 *   online checkout uses, inside one MongoDB transaction - a concurrent online
 *   order or another POS terminal can never oversell.
 * - The staff reference, PAID payment state and COMPLETED status are written by
 *   the server, and an idempotency key protects retries from creating two sales.
 */
export async function createInStoreOrder(
  payload: PosSaleRequest,
  staff: StaffView,
): Promise<PosReceipt> {
  await ensureRequestTime();

  try {
    await connectDB();
  } catch (error) {
    throw toDatabaseError(error);
  }

  // Idempotent replay: a slow network retry that already produced a completed
  // sale returns that sale instead of charging twice.
  if (payload.idempotencyKey) {
    try {
      const existing = await Order.findOne({ idempotencyKey: payload.idempotencyKey })
        .lean<LeanOrder | null>();
      if (existing) {
        logger.info("In-store sale replayed from idempotency key", {
          orderNumber: existing.orderNumber,
        });
        return toPosReceipt(existing, staff.name, true);
      }
    } catch (error) {
      throw toDatabaseError(error);
    }
  }

  const requestedLines = mergeCartDraftLines(payload.items);

  let products: LeanProductForOrder[];
  try {
    products = await Product.find({
      _id: { $in: requestedLines.map((line) => new Types.ObjectId(line.productId)) },
    })
      .select("name sku image priceInPaise stock isService isActive")
      .lean<LeanProductForOrder[]>();
  } catch (error) {
    throw toDatabaseError(error);
  }

  const resolved = buildOrderSnapshots(requestedLines, products);

  if (resolved.missing.length > 0) {
    throw new NotFoundError(
      `Some items in this sale are not available (${resolved.missing.join(", ")}).`,
    );
  }

  if (resolved.unavailable.length > 0) {
    throw new ProductUnavailableError(
      `These items are no longer available: ${resolved.unavailable.join(", ")}.`,
    );
  }

  if (resolved.insufficient.length > 0) {
    throw new OutOfStockError(
      `Not enough stock for ${resolved.insufficient.join(", ")}. Please adjust the quantity and try again.`,
    );
  }

  const subtotalInPaise = resolved.items.reduce((total, item) => total + item.lineTotalInPaise, 0);

  const idempotencyKey = payload.idempotencyKey?.trim() || "";

  const orderBase = {
    channel: ORDER_CHANNEL.IN_STORE,
    status: ORDER_STATUS.COMPLETED,
    paymentMethod: payload.paymentMethod,
    paymentStatus: PAYMENT_STATUS.PAID,
    customerId: null,
    customerName: payload.customerName?.trim() ?? "",
    customerEmail: payload.customerEmail?.trim().toLowerCase() ?? "",
    customerPhone: "",
    items: resolved.items,
    subtotalInPaise,
    discountInPaise: 0,
    taxInPaise: 0,
    totalInPaise: subtotalInPaise,
    refundedTotalInPaise: 0,
    refunds: [],
    // Omit the key entirely when absent: the sparse unique index allows only
    // documents that actually carry the field, so anonymous sales never collide.
    ...(idempotencyKey ? { idempotencyKey } : {}),
    notes: "",
    placedByStaffId: new Types.ObjectId(staff.id),
    placedByName: staff.name.trim(),
  };

  for (let attempt = 0; attempt < ORDER_NUMBER_MAX_ATTEMPTS; attempt += 1) {
    const orderNumber = generateOrderNumber();
    const session = await mongoose.startSession();

    try {
      const created = await session.withTransaction(async () => {
        await decrementPhysicalStock(resolved.items, session);

        const createdOrders = await Order.create([{ ...orderBase, orderNumber }], { session });
        return createdOrders[0];
      });

      const order = created.toObject() as unknown as LeanOrder;
      logger.info("In-store sale completed", {
        orderNumber: order.orderNumber,
        itemCount: order.items.length,
      });
      await recordAudit({
        actorStaffId: staff.id,
        action: AUDIT_ACTION.POS_SALE_COMPLETED,
        metadata: {
          orderNumber: order.orderNumber,
          itemCount: order.items.length,
          totalInPaise: order.totalInPaise,
          paymentMethod: order.paymentMethod,
        },
      });
      return toPosReceipt(order, staff.name, false);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        // Either an order-number collision (retry) or a racing idempotent
        // replay of an already committed sale. If the key now owns an order,
        // return that sale instead of creating a second one.
        if (payload.idempotencyKey) {
          try {
            const replay = await Order.findOne({ idempotencyKey: payload.idempotencyKey })
              .lean<LeanOrder | null>();
            if (replay) return toPosReceipt(replay, staff.name, true);
          } catch {
            // fall through to a regular retry with a fresh order number
          }
        }
        logger.warn("Order number collision - retrying with a new number", { orderNumber });
        continue;
      }
      if (isTransactionUnsupportedError(error)) {
        throw new TransactionsUnsupportedError(undefined, error);
      }
      if (isAppError(error)) {
        throw error;
      }
      logger.error("In-store sale creation failed", error, { orderNumber });
      throw new OrderCreationFailedError(undefined, error);
    } finally {
      await session.endSession();
    }
  }

  throw new OrderCreationFailedError(
    "We could not allocate a sale number. Please try again.",
  );
}

/** Public order lookup by human readable order number (never by ObjectId). */
export async function getOrderByNumber(orderNumber: string): Promise<OrderView | null> {
  const normalized = orderNumber.trim().toUpperCase();
  if (!isWellFormedOrderNumber(normalized)) return null;

  await ensureRequestTime();

  try {
    await connectDB();
    const order = await Order.findOne({ orderNumber: normalized }).lean<LeanOrder | null>();
    return order ? toOrderView(order) : null;
  } catch (error) {
    throw toDatabaseError(error);
  }
}

/**
 * Customer account order history - newest first.
 *
 * The query is always scoped by `customerId`, so one account can never see
 * another account's orders.
 */
export async function listCustomerOrders(
  customerId: string,
): Promise<CustomerOrderSummary[]> {
  if (!Types.ObjectId.isValid(customerId)) return [];

  await ensureRequestTime();

  try {
    await connectDB();
    const orders = await Order.find({ customerId: new Types.ObjectId(customerId) })
      .sort({ createdAt: -1 })
      .lean<LeanOrder[]>();
    return orders.map(toCustomerOrderSummary);
  } catch (error) {
    throw toDatabaseError(error);
  }
}

/**
 * Single order for the authenticated owner. Ownership is enforced in the
 * database query itself (orderNumber AND customerId), not by hidden UI - a
 * customer swapping the order number in the URL simply gets a not-found.
 */
export async function getCustomerOrderByNumber(
  customerId: string,
  orderNumber: string,
): Promise<OrderView | null> {
  if (!Types.ObjectId.isValid(customerId)) return null;

  const normalized = orderNumber.trim().toUpperCase();
  if (!isWellFormedOrderNumber(normalized)) return null;

  await ensureRequestTime();

  try {
    await connectDB();
    const order = await Order.findOne({
      orderNumber: normalized,
      customerId: new Types.ObjectId(customerId),
    }).lean<LeanOrder | null>();
    return order ? toOrderView(order) : null;
  } catch (error) {
    throw toDatabaseError(error);
  }
}
