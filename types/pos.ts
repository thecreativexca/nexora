import type { PaymentMethod } from "@/lib/constants/order";

/**
 * POS + inventory wire shapes shared by the client components and the API
 * services. Everything here has already been de-internalised server-side - no
 * `_id`, `__v` or cost for the register, and never any internal fields the
 * browser should not see.
 */

/** A product the current register is allowed to sell. */
export interface PosProduct {
  id: string;
  name: string;
  sku: string;
  priceInPaise: number;
  stock: number;
  isService: boolean;
  isFeatured: boolean;
  image: string;
  description: string;
  categoryId: string;
  categoryName: string;
  /** null = unlimited (service); for physical items the sellable ceiling. */
  maxOrderable: number | null;
}

export interface PosProductListResult {
  products: PosProduct[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  /** Active categories for the register's category filter. */
  categories: PosCategoryOption[];
}

/** Lightweight option used by dropdown/filter UIs. */
export interface PosCategoryOption {
  id: string;
  name: string;
}

/** One line of the current in-store sale (client state, display prices only). */
export interface PosCartLine {
  productId: string;
  name: string;
  sku: string;
  image: string;
  unitPriceInPaise: number;
  isService: boolean;
  /** Ceiling for physical items; null for services. */
  maxQuantity: number | null;
  quantity: number;
}

export interface PosCartSummary {
  lines: PosCartLine[];
  subtotalInPaise: number;
  itemCount: number;
}

/** Request sent to /api/pos/sales - only ids, quantities + metadata. */
export interface PosSaleRequest {
  items: { productId: string; quantity: number }[];
  customerName?: string;
  customerEmail?: string;
  paymentMethod: PaymentMethod;
  idempotencyKey?: string;
}

/** Historical line rendered on the receipt - never re-priced from the DB. */
export interface PosReceiptItem {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPriceInPaise: number;
  lineTotalInPaise: number;
  isService: boolean;
}

/** Complete, serialisable result of a finished in-store sale. */
export interface PosReceipt {
  orderNumber: string;
  status: string;
  statusLabel: string;
  paymentMethod: PaymentMethod;
  paymentMethodLabel: string;
  paymentStatus: string;
  paymentStatusLabel: string;
  customerName: string | null;
  customerEmail: string | null;
  staffName: string | null;
  items: PosReceiptItem[];
  subtotalInPaise: number;
  totalInPaise: number;
  itemCount: number;
  createdAt: string;
  /** True when the sale was replayed for an idempotent retry. */
  replayed: boolean;
}

/** Inventory row - includes internal cost (staff-only module). */
export interface InventoryProduct {
  id: string;
  name: string;
  slug: string;
  description: string;
  sku: string;
  priceInPaise: number;
  costInPaise: number;
  stock: number;
  categoryId: string;
  categoryName: string;
  image: string;
  isActive: boolean;
  isFeatured: boolean;
  isService: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryListResult {
  products: InventoryProduct[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  /** All existing categories (for the Add/Edit product form). */
  categories: PosCategoryOption[];
}

export type InventoryTypeFilter = "physical" | "service";