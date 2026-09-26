"use client";

import {
  createContext,
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { cartItemCount, cartSubtotalInPaise } from "@/lib/cart/cart-logic";
import {
  addLineToStore,
  clearCartStore,
  decrementLineInStore,
  getCartServerSnapshot,
  getCartSnapshot,
  incrementLineInStore,
  isServerSnapshot,
  removeLineFromStore,
  setLineQuantityInStore,
  subscribeToCart,
} from "@/lib/cart/local-cart-store";
import type { CartLine } from "@/types/cart";

export interface CartContextValue {
  lines: readonly CartLine[];
  itemCount: number;
  subtotalInPaise: number;
  /** False until the persisted bag has been read on the client. */
  hydrated: boolean;
  isDrawerOpen: boolean;
  lastAddedProductId: string | null;
  addLine: (line: Omit<CartLine, "quantity" | "addedAt">, quantity?: number) => void;
  increment: (productId: string) => void;
  decrement: (productId: string) => void;
  setQuantity: (productId: string, quantity: number) => void;
  removeLine: (productId: string) => void;
  clearCart: () => void;
  openDrawer: () => void;
  closeDrawer: () => void;
}

export const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  /** Server renders an empty snapshot; the saved bag arrives after hydration. */
  const lines = useSyncExternalStore(
    subscribeToCart,
    getCartSnapshot,
    getCartServerSnapshot,
  );
  const hydrated = !isServerSnapshot(lines);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [lastAddedProductId, setLastAddedProductId] = useState<string | null>(null);

  const addLine = useCallback(
    (line: Omit<CartLine, "quantity" | "addedAt">, quantity = 1) => {
      addLineToStore(line, quantity);
      setLastAddedProductId(line.productId);
      setIsDrawerOpen(true);
    },
    [],
  );

  const increment = useCallback((productId: string) => {
    incrementLineInStore(productId);
  }, []);

  const decrement = useCallback((productId: string) => {
    decrementLineInStore(productId);
  }, []);

  const setQuantity = useCallback((productId: string, quantity: number) => {
    setLineQuantityInStore(productId, quantity);
  }, []);

  const removeLine = useCallback((productId: string) => {
    removeLineFromStore(productId);
  }, []);

  const clearCart = useCallback(() => {
    clearCartStore();
    setLastAddedProductId(null);
  }, []);

  const openDrawer = useCallback(() => setIsDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setIsDrawerOpen(false), []);

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      itemCount: cartItemCount(lines),
      subtotalInPaise: cartSubtotalInPaise(lines),
      hydrated,
      isDrawerOpen,
      lastAddedProductId,
      addLine,
      increment,
      decrement,
      setQuantity,
      removeLine,
      clearCart,
      openDrawer,
      closeDrawer,
    }),
    [
      lines,
      hydrated,
      isDrawerOpen,
      lastAddedProductId,
      addLine,
      increment,
      decrement,
      setQuantity,
      removeLine,
      clearCart,
      openDrawer,
      closeDrawer,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
