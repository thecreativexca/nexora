"use client";

import { useCallback, useEffect, useState } from "react";

import { PaginationControl } from "@/components/pos/Pagination";
import { CategoryManagerDialog } from "@/components/pos/inventory/CategoryManagerDialog";
import { InventoryProductForm } from "@/components/pos/inventory/InventoryProductForm";
import { StockAdjustmentDialog } from "@/components/pos/inventory/StockAdjustmentDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { ProductImage } from "@/components/common/ProductImage";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Price } from "@/components/ui/Price";
import { Spinner } from "@/components/ui/Spinner";
import { formatMoney } from "@/lib/utils/money";
import { INVENTORY_PAGE_SIZE } from "@/lib/constants/pos";
import { formatDate } from "@/lib/utils/format";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { getJson } from "@/components/pos/api";
import type {
  InventoryListResult,
  InventoryProduct,
  InventoryTypeFilter,
} from "@/types/pos";

type ActiveFilter = "all" | "active" | "inactive";

export function InventoryView({ staffName }: { staffName: string }) {
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [categories, setCategories] = useState<InventoryListResult["categories"]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [categoryId, setCategoryId] = useState("");
  const [active, setActive] = useState<ActiveFilter>("all");
  const [type, setType] = useState<InventoryTypeFilter | "all">("all");
  const [featured, setFeatured] = useState<"all" | "featured">("all");
  const [lowStockOnly, setLowStockOnly] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<InventoryProduct | null>(null);
  const [adjustingProduct, setAdjustingProduct] = useState<InventoryProduct | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setLoadError(null);

      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(INVENTORY_PAGE_SIZE),
      });
      if (debouncedSearch) params.set("q", debouncedSearch.trim());
      if (categoryId) params.set("categoryId", categoryId);
      if (active !== "all") params.set("active", active === "active" ? "true" : "false");
      if (type !== "all") params.set("type", type);
      if (featured === "featured") params.set("featured", "true");
      if (lowStockOnly) params.set("lowStockOnly", "true");

      const result = await getJson<InventoryListResult>(`/api/pos/inventory?${params.toString()}`);
      if (cancelled) return;
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
      cancelled = true;
    };
  }, [debouncedSearch, categoryId, active, type, featured, lowStockOnly, page, reloadKey]);

  const onSaved = useCallback(
    (updated: InventoryProduct) => {
      setFormOpen(false);
      setEditingProduct(null);
      setToast(
        products.some((item) => item.id === updated.id)
          ? `${updated.name} was updated.`
          : `${updated.name} was added to the catalogue.`,
      );
      setReloadKey((current) => current + 1);
    },
    [products],
  );

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const summary = `${total} product${total === 1 ? "" : "s"}`;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">Inventory</h1>
          <p className="mt-1 text-sm text-slate-600">
            {summary} · managed by <span className="font-semibold">{staffName}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setCategoryDialogOpen(true)}>
            Categories
          </Button>
          <Button
            onClick={() => {
              setEditingProduct(null);
              setFormOpen(true);
            }}
          >
            Add product
          </Button>
        </div>
      </header>

      {toast ? (
        <p role="status" className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
          {toast}
        </p>
      ) : null}

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4">
          <div className="flex flex-col gap-3 sm:flex-row flex-wrap">
            <input
              type="search"
              aria-label="Search inventory"
              placeholder="Search by name, SKU, or barcode…"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:ring-0 sm:max-w-md"
            />
            <select
              aria-label="Filter by category"
              value={categoryId}
              onChange={(event) => {
                setCategoryId(event.target.value);
                setPage(1);
              }}
              className="h-12 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-slate-900 focus:ring-0 sm:w-48"
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by status"
              value={active}
              onChange={(event) => {
                setActive(event.target.value as ActiveFilter);
                setPage(1);
              }}
              className="h-12 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-slate-900 focus:ring-0"
            >
              <option value="all">Active + inactive</option>
              <option value="active">Active only</option>
              <option value="inactive">Inactive only</option>
            </select>
            <select
              aria-label="Filter by type"
              value={type}
              onChange={(event) => {
                setType(event.target.value as InventoryTypeFilter | "all");
                setPage(1);
              }}
              className="h-12 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-slate-900 focus:ring-0"
            >
              <option value="all">Physical + services</option>
              <option value="physical">Physical only</option>
              <option value="service">Services only</option>
            </select>
            <Button
              variant={featured === "featured" ? "primary" : "secondary"}
              size="md"
              onClick={() => {
                setFeatured((current) => (current === "featured" ? "all" : "featured"));
                setPage(1);
              }}
            >
              {featured === "featured" ? "Featured ★" : "Featured"}
            </Button>
            <Button
              variant={lowStockOnly ? "primary" : "secondary"}
              size="md"
              onClick={() => {
                setLowStockOnly((current) => !current);
                setPage(1);
              }}
            >
              {lowStockOnly ? "Low Stock ⚠" : "Low Stock"}
            </Button>
          </div>
        </div>

        {loadError ? (
          <div className="p-6">
            <ErrorState
              title="Could not load the inventory"
              description={loadError}
              action={
                <Button variant="secondary" onClick={() => setReloadKey((current) => current + 1)}>
                  Retry
                </Button>
              }
            />
          </div>
        ) : loading && products.length === 0 ? (
          <div className="flex items-center justify-center gap-2 p-16 text-sm text-slate-500">
            <Spinner /> Loading inventory…
          </div>
        ) : products.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No products found"
              description="Adjust the filters or add your first product."
            />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3 text-right">Price</th>
                    <th className="px-4 py-3 text-right">Cost</th>
                    <th className="px-4 py-3 text-right">Stock</th>
                    <th className="px-4 py-3 text-center">Service</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Updated</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {products.map((product) => (
                    <tr key={product.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-11 w-11 shrink-0">
                            <ProductImage src={product.image} alt={product.name} sizes="44px" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-900">{product.name}</p>
                            <p className="truncate text-xs text-slate-500">
                              {product.categoryName}
                              {product.unit ? ` · ${product.unit}` : ""}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700">
                        {product.sku}
                        {product.barcode ? (
                          <span className="block text-xs font-normal text-slate-400">
                            {product.barcode}
                          </span>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-900">
                        <Price amountInPaise={product.priceInPaise} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">
                        {formatMoney(product.costInPaise)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        {product.isService ? (
                          <span className="text-slate-400">—</span>
                        ) : product.stock <= 0 ? (
                          <span className="font-bold text-rose-600">0 (Out)</span>
                        ) : product.isLowStock ? (
                          <span className="font-bold text-amber-700">{product.stock} (Low)</span>
                        ) : (
                          <span className="font-bold text-emerald-700">{product.stock}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {product.isService ? <Badge tone="neutral">Service</Badge> : <span className="text-xs text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <Badge tone={product.isActive ? "success" : "neutral"}>
                            {product.isActive ? "Active" : "Inactive"}
                          </Badge>
                          {product.isFeatured ? <Badge tone="warning">Featured</Badge> : null}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                        {formatDate(product.updatedAt)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {!product.isService ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setAdjustingProduct(product)}
                            >
                              Adjust
                            </Button>
                          ) : null}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingProduct(product);
                              setFormOpen(true);
                            }}
                          >
                            Edit
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
              <div className="px-0">
                <PaginationControl page={page} totalPages={totalPages} onPageChange={setPage} />
              </div>
            </div>
          </>
        )}
      </div>

      {categoryDialogOpen ? (
        <CategoryManagerDialog
          onClose={() => setCategoryDialogOpen(false)}
          onCreated={(category) => {
            setCategories((current) =>
              [...current, category].sort((a, b) => a.name.localeCompare(b.name)),
            );
            setReloadKey((current) => current + 1);
          }}
        />
      ) : null}

      {formOpen ? (
        <InventoryProductForm
          product={editingProduct}
          categories={categories}
          onClose={() => {
            setFormOpen(false);
            setEditingProduct(null);
          }}
          onSaved={onSaved}
        />
      ) : null}

      {adjustingProduct ? (
        <StockAdjustmentDialog
          product={adjustingProduct}
          onClose={() => setAdjustingProduct(null)}
          onSaved={(updated) => {
            setAdjustingProduct(null);
            setToast(`Stock adjusted for ${updated.name}.`);
            setReloadKey((c) => c + 1);
          }}
        />
      ) : null}
    </div>
  );
}