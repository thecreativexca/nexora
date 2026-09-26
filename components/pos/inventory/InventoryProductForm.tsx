"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { ProductImage } from "@/components/common/ProductImage";
import { uploadFileJson, patchJson, postJson } from "@/components/pos/api";
import { cn } from "@/lib/utils/cn";
import { MINOR_UNITS_PER_MAJOR_UNIT } from "@/lib/constants/currency";
import type { InventoryProduct, PosCategoryOption } from "@/types/pos";

interface FormValues {
  name: string;
  description: string;
  sku: string;
  priceRup: string;
  costRup: string;
  stock: string;
  categoryId: string;
  image: string;
  isActive: boolean;
  isFeatured: boolean;
  isService: boolean;
}

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
    priceRup: product ? toRup(product.priceInPaise) : "",
    costRup: product ? toRup(product.costInPaise) : "",
    stock: product ? String(product.stock) : "0",
    categoryId: product?.categoryId ?? categories[0]?.id ?? "",
    image: product?.image ?? "",
    isActive: product?.isActive ?? true,
    isFeatured: product?.isFeatured ?? false,
    isService: product?.isService ?? false,
  }));

  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

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
    const stock = Number(values.stock);

    const payload = {
      name: values.name,
      description: values.description,
      sku: values.sku,
      priceInPaise: priceInPaise ?? 0,
      costInPaise: costInPaise ?? 0,
      stock: Number.isFinite(stock) ? stock : 0,
      category: values.categoryId,
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
      if (Object.keys(result.fieldErrors).length > 0) {
        setFieldErrors(result.fieldErrors);
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={editing ? `Edit ${product.name}` : "Add product"}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="my-4 w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-900">
            {editing ? `Edit ${product.name}` : "Add product"}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
          >
            ✕
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          {formError ? (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
              {formError}
            </p>
          ) : null}

          <TextField
            label="Product name"
            name="name"
            value={values.name}
            error={fieldErrors.name?.[0] ?? null}
            onChange={(event) => set("name", event.target.value)}
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              label="SKU"
              name="sku"
              value={values.sku}
              error={fieldErrors.sku?.[0] ?? null}
              placeholder="E.g. COFFEE-MC-250"
              onChange={(event) => set("sku", event.target.value)}
            />
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
          </div>

          <TextField
            label="Description"
            name="description"
            optional
            value={values.description}
            error={fieldErrors.description?.[0] ?? null}
            onChange={(event) => set("description", event.target.value)}
          />

          <div className="grid gap-5 sm:grid-cols-3">
            <TextField
              label="Price (₹)"
              name="price"
              inputMode="decimal"
              value={values.priceRup}
              error={priceFieldError ?? null}
              placeholder="0.00"
              onChange={(event) => set("priceRup", event.target.value)}
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
            <TextField
              label="Stock"
              name="stock"
              inputMode="numeric"
              value={values.stock}
              error={fieldErrors.stock?.[0] ?? null}
              disabled={values.isService}
              onChange={(event) => set("stock", event.target.value)}
            />
          </div>

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
            {values.isService ? (
              <p className="mt-1.5 text-xs text-slate-500">
                Services are sold without touching stock.
              </p>
            ) : null}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-800">
              Image <span className="ml-1 text-slate-400">(optional)</span>
            </label>
            <div className="flex items-start gap-3">
              <div className="w-24 shrink-0">
                <ProductImage src={values.image} alt="Product preview" sizes="96px" />
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex gap-2">
                  <input
                    type="url"
                    placeholder="Paste an image URL…"
                    value={values.image}
                    onChange={(event) => set("image", event.target.value)}
                    className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:ring-0"
                  />
                  <label className="flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                    {uploading ? "Uploading…" : "Upload"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      className="sr-only"
                      disabled={uploading}
                      onChange={(event) => void handleUpload(event.target.files?.[0])}
                    />
                  </label>
                </div>
                {uploadError ? (
                  <p className="text-xs font-medium text-rose-600">{uploadError}</p>
                ) : null}
                {fieldErrors.image?.[0] ? (
                  <p className="text-xs font-medium text-rose-600">{fieldErrors.image[0]}</p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={values.isActive}
                onChange={(event) => set("isActive", event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
              />
              Active (sellable)
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={values.isFeatured}
                onChange={(event) => set("isFeatured", event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
              />
              Featured
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={submitting} onClick={() => void handleSubmit()}>
            {submitting ? "Saving…" : editing ? "Save changes" : "Add product"}
          </Button>
        </div>
      </div>
    </div>
  );
}