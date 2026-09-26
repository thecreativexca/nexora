import { MAX_LINE_QUANTITY } from "@/lib/constants/catalog";
import type { CartLineDraft } from "@/types/cart";

/**
 * Collapses duplicate product ids and enforces the per-line quantity ceiling.
 * Shared by the cart validation endpoint and the order service.
 */
export function mergeCartDraftLines(lines: readonly CartLineDraft[]): CartLineDraft[] {
  const quantities = new Map<string, number>();

  for (const line of lines) {
    const next = (quantities.get(line.productId) ?? 0) + line.quantity;
    quantities.set(line.productId, Math.min(next, MAX_LINE_QUANTITY));
  }

  return Array.from(quantities, ([productId, quantity]) => ({ productId, quantity }));
}
