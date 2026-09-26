export interface CartLineDraft {
  productId: string;
  quantity: number;
}

/**
 * Client-side cart line. Prices here are for display only - they are never
 * trusted. The server re-reads price, stock and availability from MongoDB
 * during checkout.
 */
export interface CartLine extends CartLineDraft {
  slug: string;
  name: string;
  image: string;
  unitPriceInPaise: number;
  isService: boolean;
  /** Highest orderable quantity known when the line was added (null = no limit). */
  stockLimit: number | null;
  addedAt: number;
}

export type CartLineIssueStatus =
  | "OK"
  | "NOT_FOUND"
  | "INACTIVE"
  | "OUT_OF_STOCK"
  | "INSUFFICIENT_STOCK";

export interface CartLineValidation {
  productId: string;
  slug: string;
  name: string;
  image: string;
  isService: boolean;
  unitPriceInPaise: number;
  quantity: number;
  lineTotalInPaise: number;
  available: boolean;
  maxQuantity: number | null;
  status: CartLineIssueStatus;
  message: string | null;
}

export interface CartValidation {
  lines: CartLineValidation[];
  subtotalInPaise: number;
  itemCount: number;
  hasIssues: boolean;
}
