"use client";

import {
  CART_STORAGE_KEY,
  addLine,
  decrementLine,
  incrementLine,
  removeLine,
  setLineQuantity,
} from "@/lib/cart/cart-logic";
import { parseStoredCart } from "@/lib/validations/cart";
import type { CartLine } from "@/types/cart";

/**
 * localStorage-backed cart store.
 *
 * Implemented as an external store consumed through `useSyncExternalStore`, so
 * - the server renders an empty bag snapshot (no hydration mismatch),
 * - the saved bag is restored in a single post-hydration render,
 * - other browser tabs stay in sync through the `storage` event.
 *
 * Stored values are display-only: checkout always re-reads price, stock and
 * availability from MongoDB.
 */
const SERVER_SNAPSHOT: readonly CartLine[] = [];
const listeners = new Set<() => void>();

let cachedRaw: string | null | undefined;
let cachedLines: readonly CartLine[] = SERVER_SNAPSHOT;

function readSnapshot(): readonly CartLine[] {
  if (typeof window === "undefined") return SERVER_SNAPSHOT;

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(CART_STORAGE_KEY);
  } catch {
    // Storage blocked (private mode) - keep whatever we have in memory.
    return cachedLines;
  }

  if (raw === cachedRaw) return cachedLines;
  cachedRaw = raw;
  cachedLines = parseStoredCart(raw);
  return cachedLines;
}

export function getCartSnapshot(): readonly CartLine[] {
  return readSnapshot();
}

export function getCartServerSnapshot(): readonly CartLine[] {
  return SERVER_SNAPSHOT;
}

/** True once React has switched from the server snapshot to the real bag. */
export function isServerSnapshot(lines: readonly CartLine[]): boolean {
  return lines === SERVER_SNAPSHOT;
}

export function subscribeToCart(listener: () => void): () => void {
  listeners.add(listener);

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== CART_STORAGE_KEY) return;
    cachedRaw = undefined;
    for (const current of listeners) current();
  };

  window.addEventListener("storage", handleStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

function writeCart(lines: readonly CartLine[]): void {
  cachedLines = lines;
  cachedRaw = JSON.stringify(lines);
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, cachedRaw);
  } catch {
    // Quota or unavailable storage: the bag still works for this session.
  }
  for (const listener of listeners) listener();
}

export function addLineToStore(
  line: Omit<CartLine, "quantity" | "addedAt">,
  quantity = 1,
): void {
  writeCart(addLine(readSnapshot(), line, quantity));
}

export function incrementLineInStore(productId: string): void {
  writeCart(incrementLine(readSnapshot(), productId));
}

export function decrementLineInStore(productId: string): void {
  writeCart(decrementLine(readSnapshot(), productId));
}

export function setLineQuantityInStore(productId: string, quantity: number): void {
  writeCart(setLineQuantity(readSnapshot(), productId, quantity));
}

export function removeLineFromStore(productId: string): void {
  writeCart(removeLine(readSnapshot(), productId));
}

export function clearCartStore(): void {
  writeCart([]);
}
