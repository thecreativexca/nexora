"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { ProductImage } from "@/components/common/ProductImage";
import { getJson, uploadFileJson, patchJson, postJson } from "@/components/pos/api";
import { cn } from "@/lib/utils/cn";
import { MINOR_UNITS_PER_MAJOR_UNIT } from "@/lib/constants/currency";
import type { InventoryProduct, PosCategoryOption } from "@/types/pos";

interface FormValues {
  name: string;
  description: string;
  sku: string;
  barcode: string;
  priceRup: string;
  costRup: string;
  mrpRup: string;
  taxRate: string;
  unit: string;
  minStockThreshold: string;
  stock: string;
  categoryId: string;
  supplierId: string;
  image: string;
  isActive: boolean;
  isFeatured: boolean;
  isService: boolean;
}

const COMMON_UNITS = [
  "Piece",
  "Box",
  "Pack",
  "Kilogram",
  "Gram",
  "Liter",
  "Meter",
  "Pair",
  "Dozen",
];

const TAX_RATES = [0, 5, 12, 18, 28];

function toRup(valueInPaise: number): string {
  return (valueInPaise / MINOR_UNITS_PER_MAJOR_UNIT).toFixed(2);
}

function rupToPaise(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * MINOR_UNITS_PER_MAJOR_UNIT);
}

export function InventoryProductForm({
  product,
  categories,
  onClose,
  onSaved,
}: {
  product: InventoryProduct | null;
  categories: PosCategoryOption[];
  onClose: () => void;
  onSaved: (product: InventoryProduct) => void;
}) {
  const editing = product !== null;

  const [values, setValues] = useState<FormValues>(() => ({
    name: product?.name ?? "",
    description: product?.description ?? "",
    sku: product?.sku ?? "",
    barcode: product?.barcode ?? "",
    priceRup: product ? toRup(product.priceInPaise) : "",
    costRup: product ? toRup(product.costInPaise) : "",
    mrpRup: product?.mrpInPaise ? toRup(product.mrpInPaise) : "",
    taxRate: product?.taxRate !== undefined ? String(product.taxRate) : "0",
    unit: product?.unit ?? "Piece",
    minStockThreshold: product?.minStockThreshold !== undefined ? String(product.minStockThreshold) : "5",
    stock: product ? String(product.stock) : "0",
    categoryId: product?.categoryId ?? categories[0]?.id ?? "",
    supplierId: product?.supplierId ?? "",
    image: product?.image ?? "",
    isActive: product?.isActive ?? true,
    isFeatured: product?.isFeatured ?? false,
    isService: product?.isService ?? false,
  }));

  const [suppliers, setSuppliers] = useState<{ id: string; name: string; businessName: string }[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await getJson<{ suppliers: { id: string; name: string; businessName: string }[] }>(
        "/api/pos/suppliers?pageSize=100",
      );
      if (res.ok && res.data) {
        setSuppliers(res.data.suppliers);
      }
    })();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((previous) => ({ ...previous, [key]: value }));
    setFieldErrors((previous) => {
      if (!(key in previous)) return previous;
      const next = { ...previous };
      delete next[key];
      return next;
    });
  };

  const priceFieldError = fieldErrors.priceInPaise?.[0];
  const costFieldError = fieldErrors.costInPaise?.[0];

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    const result = await uploadFileJson<{ imageUrl: string }>(
      "/api/pos/inventory/images",
      file,
    );
    setUploading(false);
    if (result.ok) {
      setValues((previous) => ({ ...previous, image: result.data.imageUrl }));
    } else {
      setUploadError(result.message);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    const priceInPaise = rupToPaise(values.priceRup);
    const costInPaise = values.costRup.trim() === "" ? 0 : rupToPaise(values.costRup);
    const mrpInPaise = values.mrpRup.trim() === "" ? undefined : rupToPaise(values.mrpRup);
    const stock = Number(values.stock);

    const payload = {
      name: values.name,
      description: values.description,
      sku: values.sku,
      barcode: values.barcode.trim() || undefined,
      priceInPaise: priceInPaise ?? 0,
      costInPaise: costInPaise ?? 0,
      mrpInPaise: mrpInPaise ?? undefined,
      taxRate: values.taxRate.trim() !== "" ? parseFloat(values.taxRate) || 0 : 0,
      unit: values.unit.trim() || "Piece",
      minStockThreshold: values.minStockThreshold ? parseInt(values.minStockThreshold, 10) || 5 : 5,
      stock: Number.isFinite(stock) ? stock : 0,
      category: values.categoryId,
      supplier: values.supplierId || undefined,
      image: values.image,
      isActive: values.isActive,
      isFeatured: values.isFeatured,
      isService: values.isService,
    };

    const endpoint = editing
      ? `/api/pos/inventory/${product.id}`
      : "/api/pos/inventory";
    const result = editing
      ? await patchJson<{ product: InventoryProduct }>(endpoint, payload)
      : await postJson<{ product: InventoryProduct }>(endpoint, payload);

    setSubmitting(false);
    if (result.ok) {
      onSaved(result.data.product);
    } else {
      setFormError(result.message);
      if (result.fieldErrors) setFieldErrors(result.fieldErrors);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-form-title"
    >
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <h2
            id="product-form-title"
            className="text-lg font-bold text-slate-900"
          >
            {editing ? `Edit ${product.name}` : "Add product"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
          >
            ✕
          </button>
        </div>

        {formError ? (
          <p
            role="alert"
            className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700"
          >
            {formError}
          </p>
        ) : null}

        <div className="mt-5 space-y-4">
          <TextField
            label="Product name"
            name="name"
            value={values.name}
            error={fieldErrors.name?.[0] ?? null}
            onChange={(event) => set("name", event.target.value)}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="SKU"
              name="sku"
              value={values.sku}
              error={fieldErrors.sku?.[0] ?? null}
              placeholder="e.g. TSH-BLU-001"
              onChange={(event) => set("sku", event.target.value)}
            />
            <TextField
              label="Barcode (EAN/UPC)"
              name="barcode"
              optional
              value={values.barcode}
              error={fieldErrors.barcode?.[0] ?? null}
              placeholder="Scan or enter barcode"
              onChange={(event) => set("barcode", event.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-800">
                Category
              </label>
              <select
                name="category"
                value={values.categoryId}
                onChange={(event) => set("categoryId", event.target.value)}
                className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-slate-900 focus:ring-0"
              >
                {categories.length === 0 ? (
                  <option value="">No categories available</option>
                ) : null}
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              {fieldErrors.category?.[0] ? (
                <p className="mt-1 text-xs font-medium text-rose-600">
                  {fieldErrors.category[0]}
                </p>
              ) : null}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-800">
                Supplier <span className="ml-1 text-slate-400">(optional)</span>
              </label>
              <select
                name="supplier"
                value={values.supplierId}
                onChange={(event) => set("supplierId", event.target.value)}
                className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-slate-900 focus:ring-0"
              >
                <option value="">No supplier linked</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.businessName})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <TextField
            label="Description"
            name="description"
            optional
            value={values.description}
            error={fieldErrors.description?.[0] ?? null}
            onChange={(event) => set("description", event.target.value)}
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <TextField
              label="Selling Price (₹)"
              name="price"
              inputMode="decimal"
              value={values.priceRup}
              error={priceFieldError ?? null}
              placeholder="0.00"
              onChange={(event) => set("priceRup", event.target.value)}
            />
            <TextField
              label="MRP (₹)"
              name="mrp"
              optional
              inputMode="decimal"
              value={values.mrpRup}
              placeholder="0.00"
              onChange={(event) => set("mrpRup", event.target.value)}
            />
            <TextField
              label="Cost price (₹)"
              name="cost"
              optional
              inputMode="decimal"
              value={values.costRup}
              error={costFieldError ?? null}
              placeholder="0.00"
              onChange={(event) => set("costRup", event.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-800">
                Tax Rate (GST %)
              </label>
              <select
                value={values.taxRate}
                onChange={(e) => set("taxRate", e.target.value)}
                className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-slate-900 focus:ring-0"
              >
                {TAX_RATES.map((rate) => (
                  <option key={rate} value={String(rate)}>
                    {rate === 0 ? "Tax Exempt (0%)" : `${rate}% GST`}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-800">
                Unit of measurement
              </label>
              <select
                value={values.unit}
                onChange={(e) => set("unit", e.target.value)}
                className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-slate-900 focus:ring-0"
              >
                {COMMON_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>

            <TextField
              label="Min stock threshold"
              name="minStockThreshold"
              inputMode="numeric"
              value={values.minStockThreshold}
              placeholder="5"
              onChange={(event) => set("minStockThreshold", event.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Current Stock"
              name="stock"
              inputMode="numeric"
              value={values.stock}
              error={fieldErrors.stock?.[0] ?? null}
              disabled={values.isService}
              onChange={(event) => set("stock", event.target.value)}
            />

            <div>
              <span className="mb-1.5 block text-sm font-medium text-slate-800">Type</span>
              <div className="grid grid-cols-2 gap-2">
                {(["physical", "service"] as const).map((type) => {
                  const isService = type === "service";
                  return (
                    <label
                      key={type}
                      className={cn(
                        "flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium",
                        values.isService === isService
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
                      )}
                    >
                      <input
                        type="radio"
                        name="product-type"
                        checked={values.isService === isService}
                        onChange={() => set("isService", isService)}
                        className="sr-only"
                      />
                      {isService ? "Service" : "Physical"}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-800">
              Image <span className="ml-1 text-slate-400">(optional)</span>
            </label>
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                <ProductImage
                  src={values.image}
                  alt={values.name || "Preview"}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="flex-1">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/avif"
                  disabled={uploading}
                  onChange={(event) => handleUpload(event.target.files?.[0])}
                  className="block w-full text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white file:hover:bg-slate-800"
                />
                {uploadError ? (
                  <p className="mt-1 text-xs text-rose-600">{uploadError}</p>
                ) : null}
                {uploading ? (
                  <p className="mt-1 text-xs text-slate-500">Uploading image…</p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 pt-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={values.isActive}
                onChange={(event) => set("isActive", event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-0"
              />
              Active (visible on shelf)
            </label>

            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={values.isFeatured}
                onChange={(event) => set("isFeatured", event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-0"
              />
              Featured product
            </label>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Saving…" : editing ? "Save changes" : "Create product"}
          </Button>
        </div>
      </div>
    </div>
  );
}