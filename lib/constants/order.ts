/**
 * Single source of truth for order domain values.
 *
 * The Order model is shared by the online storefront (channel ONLINE) and the
 * future staff POS register (channel IN_STORE), so nothing in the app should
 * ever hard-code these strings inline.
 */

export const ORDER_CHANNEL = {
  ONLINE: "ONLINE",
  IN_STORE: "IN_STORE",
} as const;
export type OrderChannel = (typeof ORDER_CHANNEL)[keyof typeof ORDER_CHANNEL];
export const ORDER_CHANNEL_VALUES = [
  ORDER_CHANNEL.ONLINE,
  ORDER_CHANNEL.IN_STORE,
] as const;

export const ORDER_CHANNEL_LABELS: Record<OrderChannel, string> = {
  ONLINE: "Online order",
  IN_STORE: "In-store sale",
};

export const ORDER_STATUS = {
  ORDER_PLACED: "ORDER_PLACED",
  PREPARING: "PREPARING",
  ON_THE_WAY: "ON_THE_WAY",
  DELIVERED: "DELIVERED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  REFUNDED: "REFUNDED",
} as const;
export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];
export const ORDER_STATUS_VALUES = [
  ORDER_STATUS.ORDER_PLACED,
  ORDER_STATUS.PREPARING,
  ORDER_STATUS.ON_THE_WAY,
  ORDER_STATUS.DELIVERED,
  ORDER_STATUS.COMPLETED,
  ORDER_STATUS.CANCELLED,
  ORDER_STATUS.REFUNDED,
] as const;

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  ORDER_PLACED: "Order placed",
  PREPARING: "Preparing",
  ON_THE_WAY: "On the way",
  DELIVERED: "Delivered",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
};

export const ORDER_STATUS_DESCRIPTIONS: Record<OrderStatus, string> = {
  ORDER_PLACED: "We have received your order and will confirm it shortly.",
  PREPARING: "Your items are being picked and packed.",
  ON_THE_WAY: "Your order is out for delivery.",
  DELIVERED: "Your order has been delivered.",
  COMPLETED: "This sale was completed at the store.",
  CANCELLED: "This order was cancelled.",
  REFUNDED: "This order was refunded.",
};

/**
 * The normal delivery progression shown by the customer order tracker.
 * CANCELLED and REFUNDED are terminal states handled separately.
 */
export const ORDER_TRACKING_STEPS = [
  ORDER_STATUS.ORDER_PLACED,
  ORDER_STATUS.PREPARING,
  ORDER_STATUS.ON_THE_WAY,
  ORDER_STATUS.DELIVERED,
] as const;
export type OrderTrackingStep = (typeof ORDER_TRACKING_STEPS)[number];

/** Orders that are still being fulfilled (shown under "Active orders"). */
export const ACTIVE_ORDER_STATUSES = [
  ORDER_STATUS.ORDER_PLACED,
  ORDER_STATUS.PREPARING,
  ORDER_STATUS.ON_THE_WAY,
] as const;

/** Orders where fulfilment has finished one way or another. */
export const PAST_ORDER_STATUSES = [
  ORDER_STATUS.DELIVERED,
  ORDER_STATUS.COMPLETED,
  ORDER_STATUS.REFUNDED,
  ORDER_STATUS.CANCELLED,
] as const;

export function isActiveOrderStatus(status: OrderStatus): boolean {
  return (ACTIVE_ORDER_STATUSES as readonly OrderStatus[]).includes(status);
}

/** Index of the status in the normal progression, or -1 for terminal states. */
export function getOrderTrackingStepIndex(status: OrderStatus): number {
  return (ORDER_TRACKING_STEPS as readonly OrderStatus[]).indexOf(status);
}

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

export const ORDER_STATUS_TONES: Record<OrderStatus, StatusTone> = {
  ORDER_PLACED: "info",
  PREPARING: "warning",
  ON_THE_WAY: "warning",
  DELIVERED: "success",
  COMPLETED: "success",
  CANCELLED: "danger",
  REFUNDED: "neutral",
};

/** Central payment methods. Online checkout is prepaid through PayPal only. */
export const PAYMENT_METHOD = {
  CASH: "CASH",
  CARD: "CARD",
  MOBILE: "MOBILE",
  UPI: "UPI",
  ONLINE_GATEWAY: "ONLINE_GATEWAY",
  PAYPAL: "PAYPAL",
} as const;
export type PaymentMethod = (typeof PAYMENT_METHOD)[keyof typeof PAYMENT_METHOD];
export const PAYMENT_METHOD_VALUES = [
  PAYMENT_METHOD.CASH,
  PAYMENT_METHOD.CARD,
  PAYMENT_METHOD.MOBILE,
  PAYMENT_METHOD.UPI,
  PAYMENT_METHOD.ONLINE_GATEWAY,
  PAYMENT_METHOD.PAYPAL,
] as const;
export const ONLINE_CHECKOUT_PAYMENT_METHODS = [
  PAYMENT_METHOD.PAYPAL,
] as const;

/**
 * Payment methods selectable on the in-store register. The POS treats a
 * completed sale as paid (paymentStatus = PAID); no external gateway is
 * contacted in this phase.
 */
export const POS_PAYMENT_METHODS = [
  PAYMENT_METHOD.CASH,
  PAYMENT_METHOD.CARD,
  PAYMENT_METHOD.MOBILE,
] as const;

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Cash",
  CARD: "Card",
  MOBILE: "Mobile",
  UPI: "UPI",
  ONLINE_GATEWAY: "Online payment",
  PAYPAL: "PayPal",
};

export const PAYMENT_STATUS = {
  PENDING: "PENDING",
  PAID: "PAID",
  FAILED: "FAILED",
  REFUNDED: "REFUNDED",
  PARTIALLY_REFUNDED: "PARTIALLY_REFUNDED",
} as const;
export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];
export const PAYMENT_STATUS_VALUES = [
  PAYMENT_STATUS.PENDING,
  PAYMENT_STATUS.PAID,
  PAYMENT_STATUS.FAILED,
  PAYMENT_STATUS.REFUNDED,
  PAYMENT_STATUS.PARTIALLY_REFUNDED,
] as const;

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: "Pending",
  PAID: "Paid",
  FAILED: "Failed",
  REFUNDED: "Refunded",
  PARTIALLY_REFUNDED: "Partially refunded",
};

export const PAYMENT_STATUS_TONES: Record<PaymentStatus, StatusTone> = {
  PENDING: "warning",
  PAID: "success",
  FAILED: "danger",
  REFUNDED: "neutral",
  PARTIALLY_REFUNDED: "neutral",
};

/** Refund foundation - the refund workflow itself ships in a later phase. */
export const REFUND_STATUS = {
  REQUESTED: "REQUESTED",
  APPROVED: "APPROVED",
  COMPLETED: "COMPLETED",
  REJECTED: "REJECTED",
} as const;
export type RefundStatus = (typeof REFUND_STATUS)[keyof typeof REFUND_STATUS];
export const REFUND_STATUS_VALUES = [
  REFUND_STATUS.REQUESTED,
  REFUND_STATUS.APPROVED,
  REFUND_STATUS.COMPLETED,
  REFUND_STATUS.REJECTED,
] as const;

export const REFUND_STATUS_LABELS: Record<RefundStatus, string> = {
  REQUESTED: "Requested",
  APPROVED: "Approved",
  COMPLETED: "Completed",
  REJECTED: "Rejected",
};

/** Human readable order number, e.g. NX-20260921-K7M2QF */
export const ORDER_NUMBER_PREFIX = "NX";
export const ORDER_NUMBER_RANDOM_LENGTH = 6;
export const ORDER_NUMBER_MAX_ATTEMPTS = 5;

/**
 * Controlled delivery workflow for ONLINE orders (Phase 5 order management).
 *
 * Staff may only step along these arrows; anything else is rejected server-side.
 * DELIVERED and COMPLETED are terminal, and CANCELLED / REFUNDED are handled by
 * their own exceptional flows (Phase 5 only ships the refund flow - cancellation
 * has no stock-restoring implementation and must not be added lightly).
 *
 * In-store (IN_STORE) sales never use this map: they are created COMPLETED at
 * the register and have no delivery progression.
 */
export const ONLINE_ORDER_TRANSITIONS: Partial<
  Record<OrderStatus, readonly OrderStatus[]>
> = {
  ORDER_PLACED: [ORDER_STATUS.PREPARING],
  PREPARING: [ORDER_STATUS.ON_THE_WAY],
  ON_THE_WAY: [ORDER_STATUS.DELIVERED],
  DELIVERED: [],
  COMPLETED: [],
  CANCELLED: [],
  REFUNDED: [],
};

/* ---------------------------------------------------------------------------
 * Orders management portal (Phase 5)
 * ------------------------------------------------------------------------- */

/** Orders table page size / safety caps - never `?limit=1000000`. */
export const ORDERS_PAGE_SIZE = 20;
export const ORDERS_MAX_PAGE_SIZE = 50;
export const ORDERS_MAX_PAGE = 1000;

/** Order-number search input cap. */
export const ORDER_SEARCH_MAX_LENGTH = 40;

/** Quick-pick reasons offered by the refund dialog (custom text also allowed). */
export const REFUND_REASON_OPTIONS = [
  "Customer return",
  "Damaged item",
  "Wrong order",
  "Other",
] as const;

export const REFUND_REASON_MIN_LENGTH = 2;
export const REFUND_REASON_MAX_LENGTH = 500;
