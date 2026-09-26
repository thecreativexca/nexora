"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { CartLineRow } from "@/components/cart/CartLineRow";
import { CartSummary } from "@/components/cart/CartSummary";
import { EmptyState } from "@/components/common/EmptyState";
import { buttonClasses } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { CloseIcon } from "@/components/ui/icons";
import { useCart } from "@/hooks/useCart";
import { isLineOrderable } from "@/lib/cart/cart-logic";
import type { CartLineValidation, CartValidation } from "@/types/cart";

/**
 * Slide-over bag.
 *
 * Opening the bag (or changing a quantity) re-validates it against MongoDB so
 * the customer sees live prices/stock, and checkout is blocked while any line is
 * unavailable. The server enforces all of this again when the order is placed.
 */
export function CartDrawer() {
  const { lines, isDrawerOpen, closeDrawer, itemCount } = useCart();
  const [validation, setValidation] = useState<CartValidation | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const linesRef = useRef(lines);

  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  const lineSignature = lines
    .map((line) => `${line.productId}:${line.quantity}`)
    .join("|");

  const revalidate = useCallback(async (signal: AbortSignal) => {
    const current = linesRef.current;
    if (current.length === 0) {
      setValidation(null);
      return;
    }
    setIsValidating(true);
    try {
      const response = await fetch("/api/cart/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: current.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
          })),
        }),
        signal,
      });
      if (!response.ok) return;
      setValidation((await response.json()) as CartValidation);
    } catch {
      // Offline / aborted request - keep showing the saved bag.
    } finally {
      setIsValidating(false);
    }
  }, []);

  useEffect(() => {
    if (!isDrawerOpen) return;
    const controller = new AbortController();
    void revalidate(controller.signal);
    return () => controller.abort();
  }, [isDrawerOpen, lineSignature, revalidate]);

  useEffect(() => {
    if (!isDrawerOpen) return;

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDrawer();
    };
    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocusedRef.current?.focus();
    };
  }, [isDrawerOpen, closeDrawer]);

  if (!isDrawerOpen) return null;

  const validationByProductId = new Map<string, CartLineValidation>(
    (validation?.lines ?? []).map((line) => [line.productId, line]),
  );
  const subtotalInPaise =
    validation?.subtotalInPaise ??
    lines.reduce((total, line) => total + line.unitPriceInPaise * line.quantity, 0);
  const hasBlockingIssues =
    Boolean(validation?.hasIssues) || lines.some((line) => !isLineOrderable(line));

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        role="presentation"
        aria-hidden="true"
        onClick={closeDrawer}
        className="absolute inset-0 bg-slate-900/40"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-drawer-title"
        className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
      >
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-4">
          <h2 id="cart-drawer-title" className="text-base font-bold text-slate-900">
            Your bag {itemCount > 0 ? `(${itemCount})` : ""}
          </h2>
          <div className="flex items-center gap-2">
            {isValidating ? <Spinner label="Checking prices and stock" /> : null}
            <button
              ref={closeButtonRef}
              type="button"
              onClick={closeDrawer}
              aria-label="Close bag"
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              <CloseIcon />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4">
          {lines.length === 0 ? (
            <div className="py-6">
              <EmptyState
                title="Your bag is empty"
                description="Add a phone, laptop or accessory - or book a repair service to get started."
                action={
                  <Link href="/products" onClick={closeDrawer} className={buttonClasses("primary")}>
                    Browse products
                  </Link>
                }
              />
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {lines.map((line) => (
                <CartLineRow
                  key={line.productId}
                  line={line}
                  validation={validationByProductId.get(line.productId)}
                />
              ))}
            </ul>
          )}
        </div>

        {lines.length > 0 ? (
          <footer className="border-t border-slate-200 px-4 py-4">
            <CartSummary
              subtotalInPaise={subtotalInPaise}
              itemCount={itemCount}
              blockingMessage={
                hasBlockingIssues
                  ? "Some items need attention before you can check out."
                  : null
              }
            />
            <div className="mt-4 flex flex-col gap-2">
              {hasBlockingIssues ? (
                <span
                  aria-disabled="true"
                  className={buttonClasses("primary", "lg", "opacity-60")}
                >
                  Fix your items to continue
                </span>
              ) : (
                <Link
                  href="/checkout"
                  onClick={closeDrawer}
                  className={buttonClasses("primary", "lg")}
                >
                  Proceed to checkout
                </Link>
              )}
              <button
                type="button"
                onClick={closeDrawer}
                className={buttonClasses("secondary", "md")}
              >
                Continue shopping
              </button>
            </div>
          </footer>
        ) : null}
      </div>
    </div>
  );
}

