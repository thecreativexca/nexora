"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { PaginationControl } from "@/components/pos/Pagination";
import { CartPanel } from "@/components/pos/register/CartPanel";
import { ProductTile } from "@/components/pos/register/ProductTile";
import { ReceiptPanel } from "@/components/pos/register/ReceiptPanel";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";
import { PAYMENT_METHOD } from "@/lib/constants/order";
import { POS_PAGE_SIZE } from "@/lib/constants/pos";
import { formatMoney, multiplyMoney, sumMoney } from "@/lib/utils/money";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { getJson, postJson } from "@/components/pos/api";
import type { PaymentMethod } from "@/lib/constants/order";
import type {
  PosCartLine,
  PosProduct,
  PosProductListResult,
  PosReceipt,
} from "@/types/pos";

export function RegisterView({ staffName }: { staffName: string }) {
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [categories, setCategories] = useState<PosProductListResult["categories"]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [categoryId, setCategoryId] = useState("");

  const [cart, setCart] = useState<PosCartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PAYMENT_METHOD.CASH);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<PosReceipt | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    void (async () => {
      setLoading(true);
      setLoadError(null);

      const params = new URLSearchParams({ page: String(page), pageSize: String(POS_PAGE_SIZE) });
      if (debouncedSearch) params.set("q", debouncedSearch.trim());
      if (categoryId) params.set("categoryId", categoryId);

      const result = await getJson<PosProductListResult>(`/api/pos/products?${params.toString()}`);
      if (!active) return;
      setLoading(false);
      if (result.ok) {
        setProducts(result.data.products);
        setCategories(result.data.categories);
        setTotal(result.data.total);
        setTotalPages(result.data.totalPages);
      } else {
        setProducts([]);
        setLoadError(result.message);
      }
    })();

    return () => {
      active = false;
    };
  }, [debouncedSearch, categoryId, page, reloadKey]);

  const searchReset = () => setPage(1);

  const addToCart = useCallback((product: PosProduct) => {
    setCart((previous) => {
      const existing = previous.find((line) => line.productId === product.id);
      const line: PosCartLine = {
        productId: product.id,
        name: product.name,
        sku: product.sku,
        image: product.image,
        unitPriceInPaise: product.priceInPaise,
        isService: product.isService,
        maxQuantity: product.maxOrderable,
        quantity: 1,
      };

      if (!existing) return [...previous, line];

      const max = product.maxOrderable;
      const quantity = max === null ? existing.quantity + 1 : Math.min(existing.quantity + 1, max);
      if (quantity === existing.quantity) return previous;
      return previous.map((item) => (item.productId === product.id ? { ...item, quantity } : item));
    });
  }, []);

  const changeQuantity = useCallback((productId: string, nextQuantity: number) => {
    setCart((previous) =>
      previous.flatMap((line) => {
        if (line.productId !== productId) return [line];
        if (!Number.isFinite(nextQuantity) || nextQuantity <= 0) return [];
        const max = line.maxQuantity;
        const quantity = max === null ? Math.floor(nextQuantity) : Math.min(Math.floor(nextQuantity), max);
        return [{ ...line, quantity }];
      }),
    );
  }, []);

  const increase = useCallback(
    (productId: string) => {
      const line = cart.find((item) => item.productId === productId);
      if (!line) return;
      changeQuantity(productId, line.quantity + 1);
    },
    [cart, changeQuantity],
  );

  const decrease = useCallback(
    (productId: string) => {
      const line = cart.find((item) => item.productId === productId);
      if (!line || line.quantity <= 1) return;
      changeQuantity(productId, line.quantity - 1);
    },
    [cart, changeQuantity],
  );

  const removeLine = useCallback((productId: string) => {
    setCart((previous) => previous.filter((line) => line.productId !== productId));
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  const { itemCount, subtotalInPaise } = useMemo(
    () => ({
      itemCount: cart.reduce((total, line) => total + line.quantity, 0),
      subtotalInPaise: sumMoney(cart.map((line) => multiplyMoney(line.unitPriceInPaise, line.quantity))),
    }),
    [cart],
  );

  const charge = useCallback(async () => {
    if (cart.length === 0 || submitting) return;
    setSubmitting(true);
    setSubmitError(null);

    const idempotencyKey = crypto.randomUUID();
    const result = await postJson<{ receipt: PosReceipt }>("/api/pos/sales", {
      items: cart.map((line) => ({ productId: line.productId, quantity: line.quantity })),
      customerName: customerName.trim() || undefined,
      customerEmail: customerEmail.trim() || undefined,
      paymentMethod,
      idempotencyKey,
    });

    setSubmitting(false);
    if (result.ok) {
      setReceipt(result.data.receipt);
      setCartOpen(false);
    } else {
      setSubmitError(result.message);
    }
  }, [cart, customerName, customerEmail, paymentMethod, submitting]);

  const newSale = useCallback(() => {
    setReceipt(null);
    setCart([]);
    setSubmitError(null);
    setCustomerName("");
    setCustomerEmail("");
    setPaymentMethod(PAYMENT_METHOD.CASH);
    setCartOpen(false);
  }, []);

  const chargeButtonLabel =
    cart.length === 0 ? "Charge total" : `Charge ${formatMoney(subtotalInPaise)}`;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">Register</h1>
          <p className="mt-1 text-sm text-slate-600">
            Opening the till for <span className="font-semibold">{staffName}</span>
          </p>
        </div>
        {itemCount > 0 ? (
          <span className="hidden text-sm text-slate-500 lg:block">
            {itemCount} {itemCount === 1 ? "item" : "items"} in the sale
          </span>
        ) : null}
      </header>

      {receipt ? <ReceiptPanel receipt={receipt} onNewSale={newSale} /> : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <main>
          <div className="flex flex-col gap-3">
            <input
              type="search"
              autoFocus
              aria-label="Search products"
              placeholder="Search products by name or SKU…"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                searchReset();
              }}
              className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:ring-0"
            />

            {categories.length > 0 ? (
              <div className="flex flex-wrap gap-2" role="list" aria-label="Filter by category">
                <button
                  type="button"
                  role="listitem"
                  onClick={() => {
                    setCategoryId("");
                    searchReset();
                  }}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                    categoryId === ""
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
                  )}
                >
                  All
                </button>
                {categories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    role="listitem"
                    onClick={() => {
                      setCategoryId(category.id);
                      searchReset();
                    }}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                      categoryId === category.id
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
                    )}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            ) : null}

            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              {loading ? "Loading products…" : `${total} product${total === 1 ? "" : "s"}`}
            </p>
          </div>

          {loadError ? (
            <div className="mt-6">
              <ErrorState
                title="Could not load the product shelf"
                description={loadError}
                action={
                  <Button variant="secondary" onClick={() => setReloadKey((current) => current + 1)}>
                    Retry
                  </Button>
                }
              />
            </div>
          ) : loading && products.length === 0 ? (
            <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <div
                  key={index}
                  className="aspect-[3/4] animate-pulse rounded-xl bg-slate-100"
                />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="mt-6">
              <EmptyState
                title="No products match"
                description="Try a different search term or category."
              />
            </div>
          ) : (
            <>
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                {products.map((product) => (
                  <ProductTile
                    key={product.id}
                    product={product}
                    inCartQuantity={
                      cart.find((line) => line.productId === product.id)?.quantity ?? 0
                    }
                    onAdd={addToCart}
                  />
                ))}
              </div>
              <PaginationControl
                page={page}
                totalPages={totalPages}
                onPageChange={(next) => {
                  setPage(next);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              />
            </>
          )}
        </main>

        {cartOpen ? (
          <button
            type="button"
            aria-label="Close cart"
            className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
            onClick={() => setCartOpen(false)}
          />
        ) : null}

        <aside
          className={cn(
            "fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white shadow-2xl transition-transform duration-200 lg:static lg:z-auto lg:w-auto lg:max-w-none lg:translate-x-0 lg:bg-transparent lg:shadow-none",
            cartOpen ? "translate-x-0" : "translate-x-full",
          )}
        >
          <CartPanel
            lines={cart}
            itemCount={itemCount}
            subtotalInPaise={subtotalInPaise}
            customerName={customerName}
            customerEmail={customerEmail}
            paymentMethod={paymentMethod}
            submitting={submitting}
            errorMessage={submitError}
            chargeLabel={chargeButtonLabel}
            onCustomerNameChange={setCustomerName}
            onCustomerEmailChange={setCustomerEmail}
            onPaymentMethodChange={setPaymentMethod}
            onIncrease={increase}
            onDecrease={decrease}
            onSetQuantity={(productId, quantity) => {
              if (quantity < 1) removeLine(productId);
              else changeQuantity(productId, quantity);
            }}
            onRemove={removeLine}
            onClear={clearCart}
            onCharge={charge}
            onClose={() => setCartOpen(false)}
          />
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 backdrop-blur lg:hidden">
        <Button
          fullWidth
          size="lg"
          onClick={() => setCartOpen(true)}
          disabled={cart.length === 0}
        >
          View cart · {itemCount} {itemCount === 1 ? "item" : "items"} ·{" "}
          {formatMoney(subtotalInPaise)}
        </Button>
      </div>
    </div>
  );
}