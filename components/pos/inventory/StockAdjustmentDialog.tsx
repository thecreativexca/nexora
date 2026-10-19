"use client";

import { useState } from "react";

import { postJson } from "@/components/pos/api";
import { Button } from "@/components/ui/Button";
import { CloseIcon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/Spinner";
import type { InventoryProduct } from "@/types/pos";

export function StockAdjustmentDialog({
  product,
  onClose,
  onSaved,
}: {
  product: InventoryProduct;
  onClose: () => void;
  onSaved: (updated: InventoryProduct) => void;
}) {
  const [adjustmentType, setAdjustmentType] = useState<"add" | "reduce">("add");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const numQty = parseInt(quantity, 10) || 0;
  const quantityChange = adjustmentType === "add" ? numQty : -numQty;
  const resultingStock = product.stock + quantityChange;

  const canSubmit = numQty > 0 && resultingStock >= 0 && reason.trim().length >= 3 && !submitting;

  async function handleAdjust() {
    if (!canSubmit) return;
    setSubmitting(true);
    setErrorMessage(null);

    const result = await postJson<InventoryProduct>("/api/pos/inventory/adjust", {
      productId: product.id,
      quantityChange,
      reason: reason.trim(),
    });

    if (result.ok) {
      onSaved(result.data);
      onClose();
    } else {
      setErrorMessage(result.message);
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="adjust-stock-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="adjust-stock-title" className="text-base font-bold text-slate-900">
              Adjust Stock
            </h2>
            <p className="text-xs text-slate-500">{product.name} (SKU: {product.sku})</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-sm">
            <span className="text-slate-600">Current on-hand stock:</span>
            <span className="text-base font-bold text-slate-900">{product.stock} {product.unit || "units"}</span>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Adjustment Type
            </label>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAdjustmentType("add")}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  adjustmentType === "add"
                    ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                + Add Stock
              </button>
              <button
                type="button"
                onClick={() => setAdjustmentType("reduce")}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  adjustmentType === "reduce"
                    ? "border-rose-600 bg-rose-50 text-rose-800"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                − Reduce Stock
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">Quantity</label>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 focus:border-slate-900 focus:ring-0"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">
              Reason <span className="text-rose-600">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Physical audit recount, damaged goods, restocking"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-slate-900 focus:ring-0"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 text-sm">
            <span className="text-slate-600">New stock after adjustment:</span>
            <span className={`font-bold ${resultingStock < 0 ? "text-rose-600" : "text-slate-900"}`}>
              {resultingStock < 0 ? "Invalid (negative)" : `${resultingStock} ${product.unit || "units"}`}
            </span>
          </div>

          {errorMessage ? (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {errorMessage}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-5 py-3">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button size="sm" disabled={!canSubmit} onClick={() => void handleAdjust()}>
            {submitting ? <Spinner className="h-4 w-4" /> : null}
            Confirm adjustment
          </Button>
        </div>
      </div>
    </div>
  );
}
