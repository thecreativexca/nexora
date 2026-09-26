/**
 * POS register + inventory module rules (Phase 4).
 *
 * Keeps page sizes, cart caps and image limits in one place so the client and
 * the server can never drift.
 */

/** Product grid page size for the register's product browser. */
export const POS_PAGE_SIZE = 24;
export const POS_MAX_PAGE_SIZE = 48;

/** Inventory table pagination. */
export const INVENTORY_PAGE_SIZE = 20;
export const INVENTORY_MAX_PAGE_SIZE = 50;
export const INVENTORY_MAX_PAGE = 1000;

/** A current-sale cart may never exceed this many distinct lines. */
export const POS_MAX_CART_LINES = 30;

/** Client-generated sale replay key (crypto.randomUUID()-shaped). */
export const POS_IDEMPOTENCY_KEY_MIN_LENGTH = 8;
export const POS_IDEMPOTENCY_KEY_MAX_LENGTH = 100;

/** Product image upload constraints (GridFS-backed). */
export const PRODUCT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const PRODUCT_IMAGE_ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

/** Falls back to when a manager pastes a URL instead of uploading a file. */
export const PRODUCT_NAME_MAX_LENGTH = 160;