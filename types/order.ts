import type {
  OrderChannel,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  StatusTone,
} from "@/lib/constants/order";

export interface OrderAddressSnapshot {
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface OrderItemSnapshotView {
  productId: string;
  productName: string;
  sku: string;
  image: string;
  quantity: number;
  unitPriceInPaise: number;
  lineTotalInPaise: number;
  taxRate?: number;
  taxInPaise?: number;
  discountInPaise?: number;
  unit?: string;
  isService: boolean;
}

/** Order shape that is safe to render in the browser (no _id, no internals). */
export interface OrderView {
  orderNumber: string;
  channel: OrderChannel;
  status: OrderStatus;
  statusLabel: string;
  statusTone: StatusTone;
  paymentMethod: PaymentMethod;
  paymentMethodLabel: string;
  paymentStatus: PaymentStatus;
  paymentStatusLabel: string;
  /** Owner account id (null for guest orders). Used server-side for authz. */
  customerId: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  deliveryAddress: OrderAddressSnapshot;
  items: OrderItemSnapshotView[];
  subtotalInPaise: number;
  discountInPaise: number;
  taxInPaise: number;
  totalInPaise: number;
  itemCount: number;
  notes: string;
  createdAt: string;
}

/** Compact row rendered on the account dashboard order lists. */
export interface CustomerOrderSummary {
  orderNumber: string;
  status: OrderStatus;
  statusLabel: string;
  statusTone: StatusTone;
  paymentMethodLabel: string;
  paymentStatus: PaymentStatus;
  paymentStatusLabel: string;
  totalInPaise: number;
  itemCount: number;
  isActive: boolean;
  createdAt: string;
}

/** Compact order confirmation payload returned by the order APIs/actions. */
export interface PlacedOrderSummary {
  orderNumber: string;
  status: OrderStatus;
  statusLabel: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  totalInPaise: number;
  itemCount: number;
  customerName: string;
  createdAt: string;
}

/* ---------------------------------------------------------------------------
 * Orders management portal (Phase 5)
 * ------------------------------------------------------------------------- */

/** One row of the staff orders table (both ONLINE and IN_STORE channels). */
export interface StaffOrderSummary {
  orderNumber: string;
  placedAt: string;
  channel: OrderChannel;
  status: OrderStatus;
  statusLabel: string;
  statusTone: StatusTone;
  customerName: string;
  customerEmail: string;
  paymentMethod: PaymentMethod;
  paymentMethodLabel: string;
  paymentStatus: PaymentStatus;
  paymentStatusLabel: string;
  itemCount: number;
  totalInPaise: number;
  /** Staff snapshot for an in-store sale; null for online orders. */
  placedByName: string | null;
  refunded: boolean;
}

export interface StaffOrderListResult {
  orders: StaffOrderSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** One refund record attached to an order. */
export interface RefundRecordView {
  amountInPaise: number;
  reason: string;
  status: string;
  statusLabel: string;
  processedByStaffId: string | null;
  processedByStaffName: string | null;
  processedAt: string | null;
}

/**
 * Full staff order detail. Everything is built from the order's own snapshot -
 * product names/SKUs/prices are never re-read from the live catalogue.
 */
export interface StaffOrderDetail {
  orderNumber: string;
  placedAt: string;
  channel: OrderChannel;
  status: OrderStatus;
  statusLabel: string;
  statusTone: StatusTone;
  paymentMethod: PaymentMethod;
  paymentMethodLabel: string;
  paymentStatus: PaymentStatus;
  paymentStatusLabel: string;
  customerId: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  deliveryAddress: OrderAddressSnapshot;
  items: OrderItemSnapshotView[];
  subtotalInPaise: number;
  discountInPaise: number;
  taxInPaise: number;
  totalInPaise: number;
  amountPaidInPaise?: number;
  changeInPaise?: number;
  itemCount: number;
  notes: string;
  /** Staff snapshot for an in-store sale; null for online orders. */
  placedById: string | null;
  placedByName: string | null;
  refunded: boolean;
  refundedTotalInPaise: number;
  refunds: RefundRecordView[];
  /**
   * Statuses the current actor may legitimately move this order to (empty for
   * in-store sales, terminal orders and non-manager roles). Server-enforced.
   */
  allowedNextStatuses: OrderStatus[];
  /**
   * Whether a full refund may be requested. Server-enforced; the UI also hides
   * the action for roles that cannot issue refunds.
   */
  refundable: boolean;
}

/** One physical quantity line touched by a refund (stock restock / missing). */
export interface RefundRestockLine {
  productId: string;
  sku: string;
  productName: string;
  quantity: number;
}

/** Payload returned by the refund endpoint. */
export interface StaffOrderRefundResult {
  order: StaffOrderDetail;
  restoredItems: RefundRestockLine[];
  missingProducts: RefundRestockLine[];
}

/* ---------------------------------------------------------------------------
 * Reports (Phase 5)
 * ------------------------------------------------------------------------- */

export interface SalesReportDay {
  date: string;
  label: string;
  revenueInPaise: number;
}

export interface SalesChannelStats {
  orderCount: number;
  revenueInPaise: number;
}

export interface SalesReport {
  generatedAt: string;
  timezone: string;
  /** Qualifying (non-refunded, non-cancelled) sales placed in the business day. */
  todayRevenueInPaise: number;
  /** Every order placed in the business day, regardless of final status. */
  ordersToday: number;
  /** All-time qualifying sales revenue, excluding refunded and cancelled. */
  totalRevenueInPaise: number;
  /** Number of all-time qualifying sales (denominator for the average). */
  totalOrderCount: number;
  averageOrderValueInPaise: number;
  /** Exactly the last 7 business days, oldest first; zero-sale days included. */
  last7Days: SalesReportDay[];
  channelBreakdown: {
    inStore: SalesChannelStats;
    online: SalesChannelStats;
    refundedCount: number;
  };
}
