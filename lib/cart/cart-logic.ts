import { MAX_CART_LINES, MAX_LINE_QUANTITY } from "@/lib/constants/catalog";
import type { CartLine } from "@/types/cart";

/**
 * Pure cart logic (no React, no browser APIs) so it can be unit tested and
 * reused by the localStorage-backed store. Prices kept here are for display
 * only - the server always re-reads them from MongoDB.
 */
export const CART_STORAGE_KEY = "nexora.cart.v1";

export function clampQuantity(quantity: number, limit: number | null): number {
  const whole = Math.floor(Number.isFinite(quantity) ? quantity : 1);
  const atLeastOne = Math.max(1, whole);
  if (limit === null) return Math.min(atLeastOne, MAX_LINE_QUANTITY);
  return Math.min(atLeastOne, Math.max(1, Math.min(limit, MAX_LINE_QUANTITY)));
}

export function isLineOrderable(line: CartLine): boolean {
  if (line.isService) return true;
  return line.stockLimit === null ? true : line.stockLimit > 0;
}

function updateLine(
  lines: readonly CartLine[],
  productId: string,
  updater: (line: CartLine) => CartLine,
): CartLine[] {
  return lines.map((line) => (line.productId === productId ? updater(line) : line));
}

/** Adds a line (or increases the quantity of an existing one). */
export function addLine(
  lines: readonly CartLine[],
  line: Omit<CartLine, "quantity" | "addedAt">,
  quantity = 1,
): CartLine[] {
  const existing = lines.find((item) => item.productId === line.productId);

  if (existing) {
    const nextQuantity = clampQuantity(existing.quantity + quantity, line.stockLimit);
    return updateLine(lines, existing.productId, (item) => ({
      ...item,
      quantity: nextQuantity,
    }));
  }

  if (lines.length >= MAX_CART_LINES) return [...lines];

  return [
    ...lines,
    { ...line, quantity: clampQuantity(quantity, line.stockLimit), addedAt: Date.now() },
  ];
}

export function incrementLine(lines: readonly CartLine[], productId: string): CartLine[] {
  return updateLine(lines, productId, (line) => ({
    ...line,
    quantity: clampQuantity(line.quantity + 1, line.stockLimit),
  }));
}

/** Decreasing below 1 removes the line entirely. */
export function decrementLine(lines: readonly CartLine[], productId: string): CartLine[] {
  return lines
    .map((line) =>
      line.productId === productId ? { ...line, quantity: line.quantity - 1 } : line,
    )
    .filter((line) => line.quantity >= 1);
}

export function setLineQuantity(
  lines: readonly CartLine[],
  productId: string,
  quantity: number,
): CartLine[] {
  return updateLine(lines, productId, (line) => ({
    ...line,
    quantity: clampQuantity(quantity, line.stockLimit),
  }));
}

export function removeLine(lines: readonly CartLine[], productId: string): CartLine[] {
  return lines.filter((line) => line.productId !== productId);
}

export function cartItemCount(lines: readonly CartLine[]): number {
  return lines.reduce((count, line) => count + line.quantity, 0);
}

export function cartSubtotalInPaise(lines: readonly CartLine[]): number {
  return lines.reduce((total, line) => total + line.unitPriceInPaise * line.quantity, 0);
}
