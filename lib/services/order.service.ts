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
  PAYMENT_METHOD,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS,
  PAYMENT_STATUS_LABELS,
  computePaymentStatus,
  isActiveOrderStatus,
  methodIsPendingVerification,
  type OrderChannel,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus,
} from "@/lib/constants/order";
import { STAFF_PERMISSION, staffHasPermission } from "@/lib/constants/staff";
import { connectDB } from "@/lib/db/mongodb";
import { ensureRequestTime } from "@/lib/db/request-time";
import { recordAudit } from "@/lib/services/audit.service";
import { recordStockMovement } from "@/lib/services/stock-movement.service";
import { toDatabaseError } from "@/lib/services/service-errors";
import {
  isAppError,
  isDuplicateKeyError,
  isTransactionUnsupportedError,
  ForbiddenError,
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
import { Customer } from "@/models/Customer";
import { Order, type OrderItemSnapshot, type OrderPaymentEntry } from "@/models/Order";
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
  barcode?: string;
  brand?: string;
  deviceModel?: string;
  caseColor?: string;
  image?: string;
  priceInPaise: number;
  stock: number;
  taxRate?: number;
  unit?: string;
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
  taxRate?: number;
  taxInPaise?: number;
  discountInPaise?: number;
  unit?: string;
  isService?: boolean;
}

export interface LeanOrder {
  orderNumber: string;
  channel: OrderChannel;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  amountPaidInPaise?: number;
  changeInPaise?: number;
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
  refundedTotalInPaise?: number;
  paymentEntries?: OrderPaymentEntry[];
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
    taxRate: item.taxRate ?? 0,
    taxInPaise: item.taxInPaise ?? 0,
    discountInPaise: item.discountInPaise ?? 0,
    unit: item.unit ?? "Piece",
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
    paymentMethodLabel:
      order.channel === ORDER_CHANNEL.ONLINE && order.paymentMethod === PAYMENT_METHOD.CASH
        ? "Cash on Delivery"
        : PAYMENT_METHOD_LABELS[order.paymentMethod],
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
    paymentMethodLabel:
      order.channel === ORDER_CHANNEL.ONLINE && order.paymentMethod === PAYMENT_METHOD.CASH
        ? "Cash on Delivery"
        : PAYMENT_METHOD_LABELS[order.paymentMethod],
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
function toPosReceipt(
  order: LeanOrder,
  fallbackStaffName: string,
  replayed: boolean,
  changeInPaise = 0,
): PosReceipt {
  const items: PosReceiptItem[] = order.items.map((item) => ({
    productId: String(item.productId),
    productName: item.productName,
    sku: item.sku,
    quantity: item.quantity,
    unitPriceInPaise: item.unitPriceInPaise,
    lineTotalInPaise: item.lineTotalInPaise,
    taxRate: item.taxRate ?? 0,
    taxInPaise: item.taxInPaise ?? 0,
    discountInPaise: item.discountInPaise ?? 0,
    unit: item.unit ?? "Piece",
    isService: Boolean(item.isService),
  }));

  const amountPaidInPaise = order.amountPaidInPaise ?? order.totalInPaise;
  const outstandingDueInPaise = Math.max(0, order.totalInPaise - amountPaidInPaise);

  return {
    business: {
      name: process.env.BUSINESS_NAME?.trim() || "Nexora",
      address: process.env.BUSINESS_ADDRESS?.trim() || "",
      contact: process.env.BUSINESS_CONTACT?.trim() || "",
      logoUrl: "/nexora-logo.svg",
    },
    orderNumber: order.orderNumber,
    status: order.status,
    statusLabel: ORDER_STATUS_LABELS[order.status],
    paymentMethod: order.paymentMethod,
    paymentMethodLabel: PAYMENT_METHOD_LABELS[order.paymentMethod],
    paymentStatus: order.paymentStatus,
    paymentStatusLabel: PAYMENT_STATUS_LABELS[order.paymentStatus],
    customerId: order.customerId ? String(order.customerId) : null,
    customerName: order.customerName.trim() ? order.customerName : null,
    customerEmail: order.customerEmail.trim() ? order.customerEmail : null,
    customerPhone: order.customerPhone?.trim() || null,
    staffName: order.placedByName?.trim() || fallbackStaffName || null,
    items,
    subtotalInPaise: order.subtotalInPaise,
    discountInPaise: order.discountInPaise ?? 0,
    taxInPaise: order.taxInPaise ?? 0,
    totalInPaise: order.totalInPaise,
    amountPaidInPaise,
    outstandingDueInPaise,
    changeInPaise: order.changeInPaise ?? changeInPaise,
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

    const taxRate = typeof product.taxRate === "number" ? product.taxRate : 0;
    const lineTotalInPaise = product.priceInPaise * line.quantity;
    const taxInPaise = Math.round((lineTotalInPaise * taxRate) / 100);

    items.push({
      productId: product._id,
      productName: [product.name, [product.brand, product.deviceModel, product.caseColor].filter(Boolean).join(" · ")].filter(Boolean).join(" — "),
      sku: product.sku,
      image: product.image ?? "",
      quantity: line.quantity,
      unitPriceInPaise: product.priceInPaise,
      lineTotalInPaise,
      taxRate,
      taxInPaise,
      discountInPaise: 0,
      unit: product.unit || "Piece",
      isService,
    });
  }

  return { items, missing, unavailable, insufficient };
}

/**
 * Atomically reserves physical stock inside a transaction. Services are never
 * decremented. The `stock >= quantity` condition makes overselling impossible;
 * because it runs inside the transaction a later failure rolls the decrement
 * back. Appends an immutable StockMovement ledger entry for each item.
 */
async function decrementPhysicalStock(
  items: readonly OrderItemSnapshot[],
  orderNumber: string,
  staff: { id?: string | null; name: string },
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
      { session, new: false },
    );

    if (!reserved) {
      throw new OutOfStockError(
        `Insufficient stock for ${item.productName} (${item.quantity} requested).`,
      );
    }

    await recordStockMovement(
      {
        productId: item.productId,
        productName: item.productName,
        sku: item.sku,
        movementType: "SALE",
        quantityChange: -item.quantity,
        quantityBefore: reserved.stock,
        quantityAfter: reserved.stock - item.quantity,
        referenceId: orderNumber,
        referenceType: "ORDER",
        reason: `Sold in order #${orderNumber}`,
        performedByStaffId: staff.id ?? null,
        performedByName: staff.name,
      },
      session,
    );
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
 * 4. Orders are created with UNPAID payment status - payment is recorded
 *    manually by staff after offline collection.
 *
 * `customerId` is supplied by the server (from the authenticated session), never
 * by the browser, so a request can never attach an order to another account.
 * Guest checkout passes `null` and stays fully supported.
 */
export async function createOnlineOrder(
  payload: CheckoutPayload,
  customerId: string | null = null,
): Promise<PlacedOrderSummary> {
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
      .select("name sku barcode brand deviceModel caseColor image priceInPaise stock taxRate unit isService isActive")
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
  const taxInPaise = resolved.items.reduce((total, item) => total + (item.taxInPaise || 0), 0);
  const discountInPaise = 0;
  const totalInPaise = subtotalInPaise - discountInPaise + taxInPaise;

  // The public storefront is COD-only. The schema rejects manipulated values;
  // this explicit guard protects direct service callers as well.
  if (payload.paymentMethod !== PAYMENT_METHOD.CASH) {
    throw new InvalidRequestError("Public checkout supports Cash on Delivery only.");
  }
  const paymentMethod = PAYMENT_METHOD.CASH;

  const orderBase = {
    channel: ORDER_CHANNEL.ONLINE,
    status: ORDER_STATUS.ORDER_PLACED,
    paymentMethod,
    paymentStatus: PAYMENT_STATUS.UNPAID,
    amountPaidInPaise: 0,
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
    paymentEntries: [],
    notes: payload.notes ?? "",
    placedByStaffId: null,
  };

  for (let attempt = 0; attempt < ORDER_NUMBER_MAX_ATTEMPTS; attempt += 1) {
    const orderNumber = generateOrderNumber();
    const session = await mongoose.startSession();

    try {
      const created = await session.withTransaction(async () => {
        // 1. Atomically reserve physical stock and record movement
        await decrementPhysicalStock(
          resolved.items,
          orderNumber,
          { id: null, name: "Online Storefront" },
          session,
        );

        // 2. Persist the order together with its historical item snapshots.
        const createdOrders = await Order.create([{ ...orderBase, orderNumber }], { session });
        return createdOrders[0];
      });

      const order = created.toObject() as unknown as LeanOrder;
      logger.info("Online order placed (offline payment)", {
        orderNumber: order.orderNumber,
        itemCount: order.items.length,
        paymentMethod,
      });
      await recordAudit({
        actorStaffId: null,
        action: AUDIT_ACTION.ONLINE_ORDER_PLACED,
        metadata: {
          orderNumber: order.orderNumber,
          paymentMethod,
          totalInPaise,
          customerId: customerId ?? undefined,
        },
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
 * Places an IN-STORE (POS register) sale.
 *
 * Runs inside a MongoDB transaction: physical stock is decremented and the
 * completed order snapshot is persisted atomically.
 *
 * Supports:
 * - Server-side tax calculation per line (GST / taxRate)
 * - Discount validation with POS_APPLY_DISCOUNT permission check
 * - Single payment (Cash with change, UPI, Card, Bank Transfer, Cheque)
 * - Split payments (multiple offline tender types)
 * - Partial / Due payments with customer ledger updates
 * - Full audit trail & immutable stock ledger logging
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
        return toPosReceipt(existing, staff.name, true, existing.changeInPaise ?? 0);
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
      .select("name sku barcode brand deviceModel caseColor image priceInPaise stock taxRate unit isService isActive")
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

  // Subtotal & Taxes
  const subtotalInPaise = resolved.items.reduce((total, item) => total + item.lineTotalInPaise, 0);
  const taxInPaise = resolved.items.reduce((total, item) => total + (item.taxInPaise || 0), 0);

  // Discount validation & application
  const requestedDiscount = payload.discountInPaise ?? 0;
  if (requestedDiscount > 0) {
    const canApplyDiscount = staff.effectivePermissions
      ? staff.effectivePermissions.includes(STAFF_PERMISSION.POS_APPLY_DISCOUNT)
      : staffHasPermission(staff.role, STAFF_PERMISSION.POS_APPLY_DISCOUNT);

    if (!canApplyDiscount) {
      throw new ForbiddenError("You do not have permission to apply discounts at the POS.");
    }
  }

  const discountInPaise = Math.min(requestedDiscount, subtotalInPaise + taxInPaise);
  const totalInPaise = Math.max(0, subtotalInPaise + taxInPaise - discountInPaise);

  // Customer resolution (optional walk-in or linked account)
  let customerId: Types.ObjectId | null = null;
  let customerName = payload.customerName?.trim() ?? "";
  let customerEmail = payload.customerEmail?.trim().toLowerCase() ?? "";
  let customerPhone = payload.customerPhone?.trim() ?? "";

  if (payload.customerId && Types.ObjectId.isValid(payload.customerId)) {
    const existingCustomer = await Customer.findById(payload.customerId).lean();
    if (existingCustomer) {
      customerId = existingCustomer._id;
      if (!customerName) customerName = existingCustomer.name;
      if (!customerEmail) customerEmail = existingCustomer.email;
      if (!customerPhone) customerPhone = existingCustomer.phone || "";
    }
  }

  // -------------------------------------------------------------------------
  // Payment logic (server-side only, decimal-safe integer paise)
  // -------------------------------------------------------------------------
  let paymentEntries: OrderPaymentEntry[] = [];
  let amountPaidInPaise = 0;
  let changeInPaise = 0;
  let paymentMethod: PaymentMethod = payload.paymentMethod;
  let paymentStatus: PaymentStatus = PAYMENT_STATUS.UNPAID;

  if (payload.splitPayments && payload.splitPayments.length > 0) {
    paymentMethod = PAYMENT_METHOD.SPLIT;
    let clearedSum = 0;
    let totalSplitSum = 0;

    for (const split of payload.splitPayments) {
      totalSplitSum += split.amountInPaise;
      const isPending = methodIsPendingVerification(split.paymentMethod);
      if (!isPending) {
        clearedSum += split.amountInPaise;
      }

      paymentEntries.push({
        paymentMethod: split.paymentMethod,
        amountInPaise: split.amountInPaise,
        referenceNumber: split.referenceNumber?.trim() ?? "",
        paymentDate: payload.paymentDate ? new Date(payload.paymentDate) : new Date(),
        verifiedByStaffId: isPending ? null : new Types.ObjectId(staff.id),
        verifiedByName: isPending ? "" : staff.name.trim(),
        notes: split.notes?.trim() ?? "",
        createdAt: new Date(),
      });
    }

    if (totalSplitSum > totalInPaise) {
      throw new InvalidRequestError(
        `Split payment total (₹${(totalSplitSum / 100).toFixed(2)}) exceeds bill total (₹${(totalInPaise / 100).toFixed(2)}).`,
      );
    }

    amountPaidInPaise = clearedSum;
    if (amountPaidInPaise === 0 && totalSplitSum > 0) {
      paymentStatus = PAYMENT_STATUS.PENDING_VERIFICATION;
    } else {
      paymentStatus = computePaymentStatus(totalInPaise, amountPaidInPaise, 0);
    }
  } else {
    // Single payment method
    const isPendingVerification = methodIsPendingVerification(paymentMethod);
    const isCash = paymentMethod === PAYMENT_METHOD.CASH;
    const cashReceived = payload.cashReceivedInPaise ?? 0;

    if (isCash && cashReceived > 0) {
      if (cashReceived >= totalInPaise) {
        amountPaidInPaise = totalInPaise;
        changeInPaise = cashReceived - totalInPaise;
        paymentStatus = PAYMENT_STATUS.PAID;
      } else {
        // Partial cash payment
        amountPaidInPaise = cashReceived;
        changeInPaise = 0;
        paymentStatus = PAYMENT_STATUS.PARTIALLY_PAID;
      }
    } else if (isPendingVerification) {
      amountPaidInPaise = 0;
      paymentStatus = PAYMENT_STATUS.PENDING_VERIFICATION;
    } else {
      // Full clearance for card, UPI, bank, or cash without change input
      amountPaidInPaise = totalInPaise;
      paymentStatus = PAYMENT_STATUS.PAID;
    }

    paymentEntries = [
      {
        paymentMethod,
        amountInPaise: amountPaidInPaise,
        referenceNumber: payload.referenceNumber?.trim() ?? "",
        paymentDate: payload.paymentDate ? new Date(payload.paymentDate) : new Date(),
        verifiedByStaffId: isPendingVerification ? null : new Types.ObjectId(staff.id),
        verifiedByName: isPendingVerification ? "" : staff.name.trim(),
        notes: payload.paymentNotes?.trim() ?? "",
        createdAt: new Date(),
      },
    ];
  }

  const idempotencyKey = payload.idempotencyKey?.trim() || "";

  const orderBase = {
    channel: ORDER_CHANNEL.IN_STORE,
    status: ORDER_STATUS.COMPLETED,
    paymentMethod,
    paymentStatus,
    amountPaidInPaise,
    changeInPaise,
    customerId,
    customerName,
    customerEmail,
    customerPhone,
    items: resolved.items,
    subtotalInPaise,
    discountInPaise,
    taxInPaise,
    totalInPaise,
    refundedTotalInPaise: 0,
    refunds: [],
    paymentEntries,
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
        // 1. Decrement physical stock and write StockMovement ledger entries
        await decrementPhysicalStock(resolved.items, orderNumber, staff, session);

        // 2. Track customer purchase & due history if customer account is linked
        if (customerId) {
          const cust = await Customer.findById(customerId).session(session);
          if (cust) {
            cust.totalPurchasesInPaise = (cust.totalPurchasesInPaise || 0) + totalInPaise;
            const due = Math.max(0, totalInPaise - amountPaidInPaise);
            if (due > 0) {
              cust.outstandingDueInPaise = (cust.outstandingDueInPaise || 0) + due;
            }
            await cust.save({ session });
          }
        }

        // 3. Create order snapshot
        const createdOrders = await Order.create([{ ...orderBase, orderNumber }], { session });
        return createdOrders[0];
      });

      const order = created.toObject() as unknown as LeanOrder;
      logger.info("In-store sale completed", {
        orderNumber: order.orderNumber,
        itemCount: order.items.length,
        paymentMethod,
        paymentStatus,
        totalInPaise: order.totalInPaise,
        amountPaidInPaise,
        changeInPaise,
      });

      await recordAudit({
        actorStaffId: staff.id,
        action: AUDIT_ACTION.POS_SALE_COMPLETED,
        metadata: {
          orderNumber: order.orderNumber,
          itemCount: order.items.length,
          subtotalInPaise: order.subtotalInPaise,
          discountInPaise: order.discountInPaise,
          taxInPaise: order.taxInPaise,
          totalInPaise: order.totalInPaise,
          paymentMethod,
          paymentStatus,
          amountPaidInPaise,
          changeInPaise,
        },
      });

      return toPosReceipt(order, staff.name, false, changeInPaise);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        if (payload.idempotencyKey) {
          try {
            const replay = await Order.findOne({ idempotencyKey: payload.idempotencyKey })
              .lean<LeanOrder | null>();
            if (replay) return toPosReceipt(replay, staff.name, true, replay.changeInPaise ?? 0);
          } catch {
            // fall through to a regular retry
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
