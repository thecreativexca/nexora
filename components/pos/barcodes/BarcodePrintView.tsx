"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { getJson, postJson } from "@/components/pos/api";
import { ProductImage } from "@/components/common/ProductImage";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Price } from "@/components/ui/Price";
import { cn } from "@/lib/utils/cn";
import { formatMoney } from "@/lib/utils/money";
import type { InventoryProduct } from "@/types/pos";

export type LabelSizePreset = "40x25" | "50x30" | "25x15" | "custom";
export type PaperFormat = "a4" | "thermal";

interface LabelDimensions {
  widthMm: number;
  heightMm: number;
  isSmall: boolean;
}

const PRESET_DIMENSIONS: Record<Exclude<LabelSizePreset, "custom">, LabelDimensions> = {
  "40x25": { widthMm: 40, heightMm: 25, isSmall: false },
  "50x30": { widthMm: 50, heightMm: 30, isSmall: false },
  "25x15": { widthMm: 25, heightMm: 15, isSmall: true },
};

export function BarcodePrintView({ staffName: _staffName }: { staffName: string }) {
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  // Print & Layout format states
  const [paperFormat, setPaperFormat] = useState<PaperFormat>("a4");
  const [labelSize, setLabelSize] = useState<LabelSizePreset>("40x25");
  const [customWidth, setCustomWidth] = useState(45);
  const [customHeight, setCustomHeight] = useState(30);

  const [barcodeSvgs, setBarcodeSvgs] = useState<Record<string, string>>({});
  const [loadingSvgs, setLoadingSvgs] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [activeTab, setActiveTab] = useState<"selector" | "preview">("selector");

  // Fetch inventory products on mount
  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      const res = await getJson<{ products: InventoryProduct[] }>("/api/pos/inventory?pageSize=100");
      if (!active) return;
      setLoading(false);
      if (res.ok && res.data) {
        setProducts(res.data.products);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Filter products by search term and category
  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (categoryFilter !== "all" && p.categoryId !== categoryFilter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.barcode && p.barcode.toLowerCase().includes(q))
      );
    });
  }, [products, search, categoryFilter]);

  // Categories list for filter
  const categories = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of products) {
      if (p.categoryId && p.categoryName) {
        map.set(p.categoryId, p.categoryName);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [products]);

  // Selected products list
  const selectedProducts = useMemo(() => {
    return products.filter((p) => selectedIds.has(p.id) && Boolean(p.barcode));
  }, [products, selectedIds]);

  // Total labels to print count
  const totalLabels = useMemo(() => {
    return selectedProducts.reduce((sum, p) => sum + (quantities[p.id] || 1), 0);
  }, [selectedProducts, quantities]);

  // Fetch SVG barcodes in batch for selected products
  useEffect(() => {
    const missingCodes = selectedProducts
      .map((p) => p.barcode!)
      .filter((code) => code && !barcodeSvgs[code]);

    if (missingCodes.length === 0) return;

    let active = true;

    void (async () => {
      setLoadingSvgs(true);
      try {
        const res = await postJson<{ barcodes: Record<string, string> }>("/api/pos/barcodes/batch", {
          items: missingCodes.map((code) => ({ code, format: "CODE128" })),
        });
        if (active && res.ok && res.data) {
          setBarcodeSvgs((prev) => ({ ...prev, ...res.data.barcodes }));
        }
      } finally {
        if (active) setLoadingSvgs(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [selectedProducts, barcodeSvgs]);

  // Toggle selection
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    if (!quantities[id]) {
      setQuantities((prev) => ({ ...prev, [id]: 1 }));
    }
  };

  // Select all filtered products (only those with barcodes)
  const selectAllFiltered = () => {
    const valid = filteredProducts.filter((p) => Boolean(p.barcode));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const p of valid) {
        next.add(p.id);
      }
      return next;
    });
    setQuantities((prev) => {
      const next = { ...prev };
      for (const p of valid) {
        if (!next[p.id]) next[p.id] = 1;
      }
      return next;
    });
  };

  // Deselect all
  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  // Bulk quantity setters
  const setAllQuantities = (qty: number) => {
    setQuantities((prev) => {
      const next = { ...prev };
      for (const id of selectedIds) {
        next[id] = qty;
      }
      return next;
    });
  };

  const matchStockQuantities = () => {
    setQuantities((prev) => {
      const next = { ...prev };
      for (const p of selectedProducts) {
        next[p.id] = Math.max(1, p.stock || 1);
      }
      return next;
    });
  };

  // Update item quantity
  const updateQuantity = (id: string, delta: number) => {
    setQuantities((prev) => {
      const current = prev[id] || 1;
      const nextVal = Math.max(1, Math.min(999, current + delta));
      return { ...prev, [id]: nextVal };
    });
  };

  const setExactQuantity = (id: string, value: number) => {
    const safe = Number.isFinite(value) ? Math.max(1, Math.min(999, Math.floor(value))) : 1;
    setQuantities((prev) => ({ ...prev, [id]: safe }));
  };

  // Current physical dimensions
  const dimensions: LabelDimensions = useMemo(() => {
    if (labelSize === "custom") {
      const w = Math.max(20, Math.min(200, customWidth));
      const h = Math.max(10, Math.min(200, customHeight));
      return { widthMm: w, heightMm: h, isSmall: w <= 30 || h <= 18 };
    }
    return PRESET_DIMENSIONS[labelSize];
  }, [labelSize, customWidth, customHeight]);

  // Estimated A4 sheet calculation
  const a4Capacity = useMemo(() => {
    const cols = Math.max(1, Math.floor(194 / (dimensions.widthMm + 2)));
    const rows = Math.max(1, Math.floor(275 / (dimensions.heightMm + 2)));
    return { cols, rows, perPage: cols * rows };
  }, [dimensions]);

  // Handle PDF Download
  const handleDownloadPdf = async () => {
    if (selectedProducts.length === 0) return;
    setDownloadingPdf(true);

    try {
      const payload = {
        items: selectedProducts.map((p) => ({
          name: p.name,
          sku: p.sku,
          barcode: p.barcode!,
          barcodeFormat: p.barcodeFormat || "CODE128",
          priceInPaise: p.priceInPaise,
          brand: p.brand,
          deviceModel: p.deviceModel,
          caseColor: p.caseColor,
          quantity: quantities[p.id] || 1,
        })),
        size: labelSize,
        layoutMode: paperFormat,
        customWidth,
        customHeight,
      };

      const res = await fetch("/api/pos/barcodes/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        alert("Failed to generate PDF. Please try again.");
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `nexora-barcodes-${paperFormat}-${labelSize}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Error generating PDF.");
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Printable label items array with repetition
  const printableItems = useMemo(() => {
    const list: InventoryProduct[] = [];
    for (const p of selectedProducts) {
      const qty = quantities[p.id] || 1;
      for (let i = 0; i < qty; i++) {
        list.push(p);
      }
    }
    return list;
  }, [selectedProducts, quantities]);

  return (
    <div className="mx-auto w-full max-w-7xl py-2 sm:py-4">
      {/* DYNAMIC PRINT PAGE SIZE STYLES (No !important in @page to comply with CSS spec) */}
      <style
        dangerouslySetInnerHTML={{
          __html:
            paperFormat === "a4"
              ? `@media print {
                  @page {
                    size: A4 portrait;
                    margin: 8mm 6mm;
                  }
                }`
              : `@media print {
                  @page {
                    size: ${dimensions.widthMm}mm ${dimensions.heightMm}mm;
                    margin: 0mm;
                  }
                }`,
        }}
      />

      {/* Screen UI: Hidden entirely during window.print() so no phantom space is created */}
      <div className="barcode-screen-ui print:hidden space-y-4">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 mb-1">
            <Link href="/pos/inventory" className="hover:text-indigo-600 transition-colors">
              Inventory
            </Link>
            <span>/</span>
            <span className="text-slate-900 font-bold">Print Barcodes</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">Print Barcodes</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Select inventory items, configure sheet or thermal roll format, and print directly or download PDF.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/pos/inventory"
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            ← Back to Inventory
          </Link>
        </div>
      </header>

      {/* Mobile Tab Switcher */}
      <div className="flex lg:hidden mt-4 rounded-xl border border-slate-200 bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => setActiveTab("selector")}
          className={cn(
            "flex-1 rounded-lg py-2 text-xs font-bold transition-all",
            activeTab === "selector"
              ? "bg-white text-slate-900 shadow-xs"
              : "text-slate-600 hover:text-slate-900",
          )}
        >
          1. Select Products ({selectedProducts.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("preview")}
          className={cn(
            "flex-1 rounded-lg py-2 text-xs font-bold transition-all",
            activeTab === "preview"
              ? "bg-white text-slate-900 shadow-xs"
              : "text-slate-600 hover:text-slate-900",
          )}
        >
          2. Preview &amp; Print ({totalLabels})
        </button>
      </div>

      {/* Main Grid: Left Selector, Right Config & Preview */}
      <div className="mt-4 lg:mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Product Selection Table */}
        <section
          className={cn(
            "lg:col-span-7 flex flex-col gap-4 bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs",
            activeTab !== "selector" && "hidden lg:flex",
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">
              1. Select Products
            </h2>
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={selectAllFiltered}
                className="font-semibold text-indigo-600 hover:text-indigo-800"
              >
                Select All ({filteredProducts.filter((p) => Boolean(p.barcode)).length})
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={deselectAll}
                className="font-semibold text-slate-500 hover:text-slate-800"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Search and Category Filter */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="sm:col-span-2 relative">
              <input
                type="search"
                placeholder="Search by name, SKU, or barcode…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:ring-0"
              />
            </div>
            <div>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-800 focus:border-slate-900 focus:ring-0"
              >
                <option value="all">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Product List Table */}
          <div className="max-h-[520px] overflow-y-auto rounded-xl border border-slate-200">
            {loading ? (
              <div className="p-8 text-center text-xs text-slate-500">Loading products…</div>
            ) : filteredProducts.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No matching products found.
              </div>
            ) : (
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 font-bold text-slate-700">
                  <tr>
                    <th className="w-10 px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={
                          filteredProducts.length > 0 &&
                          filteredProducts
                            .filter((p) => Boolean(p.barcode))
                            .every((p) => selectedIds.has(p.id))
                        }
                        onChange={(e) => {
                          if (e.target.checked) selectAllFiltered();
                          else deselectAll();
                        }}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </th>
                    <th className="px-3 py-2.5">Product</th>
                    <th className="px-3 py-2.5 whitespace-nowrap min-w-[170px]">Barcode / SKU</th>
                    <th className="px-3 py-2.5 text-right whitespace-nowrap">Price</th>
                    <th className="w-28 px-3 py-2.5 text-center">Print Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProducts.map((product) => {
                    const isSelected = selectedIds.has(product.id);
                    const hasBarcode = Boolean(product.barcode);
                    const qty = quantities[product.id] || 1;

                    return (
                      <tr
                        key={product.id}
                        className={cn(
                          "transition-colors",
                          !hasBarcode ? "opacity-60 bg-slate-50/50" : isSelected ? "bg-indigo-50/40" : "hover:bg-slate-50",
                        )}
                      >
                        <td className="px-3 py-2.5 text-center">
                          <input
                            type="checkbox"
                            disabled={!hasBarcode}
                            checked={isSelected}
                            onChange={() => toggleSelect(product.id)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-40"
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <div className="h-8 w-8 shrink-0">
                              <ProductImage src={product.image} alt={product.name} sizes="32px" />
                            </div>
                            <div className="min-w-0">
                              <p className="line-clamp-1 font-semibold text-slate-900">{product.name}</p>
                              {product.brand || product.deviceModel ? (
                                <p className="truncate text-[10px] text-slate-500">
                                  {[product.brand, product.deviceModel].filter(Boolean).join(" · ")}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap min-w-[170px]">
                          {hasBarcode ? (
                            <span className="font-mono text-xs font-bold text-slate-900 tracking-tight block">
                              {product.barcode}
                            </span>
                          ) : (
                            <Badge tone="danger" className="text-[10px]">
                              No Barcode
                            </Badge>
                          )}
                          <span className="block text-[10px] text-slate-500 font-medium">SKU {product.sku}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-slate-900 whitespace-nowrap">
                          <Price amountInPaise={product.priceInPaise} />
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white shadow-2xs">
                            <button
                              type="button"
                              disabled={!isSelected}
                              onClick={() => updateQuantity(product.id, -1)}
                              className="h-6 w-6 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                            >
                              −
                            </button>
                            <input
                              type="number"
                              min={1}
                              max={999}
                              disabled={!isSelected}
                              value={qty}
                              onChange={(e) => setExactQuantity(product.id, Number(e.target.value))}
                              className="h-6 w-10 border-x border-slate-200 text-center text-xs font-bold text-slate-900 disabled:bg-slate-50"
                            />
                            <button
                              type="button"
                              disabled={!isSelected}
                              onClick={() => updateQuantity(product.id, 1)}
                              className="h-6 w-6 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                            >
                              +
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Right Column: Size Config, Summary & Live Preview */}
        <section
          className={cn(
            "lg:col-span-5 flex flex-col gap-4",
            activeTab !== "preview" && "hidden lg:flex",
          )}
        >
          {/* Label Configuration Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">
              2. Print Format &amp; Label Size
            </h2>

            {/* Paper / Printer Format Selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Printer &amp; Paper Type</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaperFormat("a4")}
                  className={cn(
                    "flex flex-col items-start rounded-xl border p-3 text-left transition-all",
                    paperFormat === "a4"
                      ? "border-slate-900 bg-slate-900 text-white shadow-xs"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
                  )}
                >
                  <span className="text-xs font-bold">📄 A4 Sticker Sheet</span>
                  <span className={cn("text-[10px] mt-0.5", paperFormat === "a4" ? "text-slate-300" : "text-slate-500")}>
                    Multiple labels tiled per sheet (Standard / PDF)
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaperFormat("thermal")}
                  className={cn(
                    "flex flex-col items-start rounded-xl border p-3 text-left transition-all",
                    paperFormat === "thermal"
                      ? "border-slate-900 bg-slate-900 text-white shadow-xs"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
                  )}
                >
                  <span className="text-xs font-bold">🏷️ Thermal Roll</span>
                  <span className={cn("text-[10px] mt-0.5", paperFormat === "thermal" ? "text-slate-300" : "text-slate-500")}>
                    1 label per roll page (Zebra, TSC, Xprinter)
                  </span>
                </button>
              </div>
            </div>

            {/* Label Size Presets */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Label Dimensions</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: "40x25", label: "40 × 25 mm", desc: "Standard Shelf" },
                  { id: "50x30", label: "50 × 30 mm", desc: "Large Tag" },
                  { id: "25x15", label: "25 × 15 mm", desc: "Small Jewelry" },
                  { id: "custom", label: "Custom mm", desc: "Enter size" },
                ].map((preset) => {
                  const active = labelSize === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setLabelSize(preset.id as LabelSizePreset)}
                      className={cn(
                        "flex flex-col items-start rounded-xl border p-2.5 text-left transition-all",
                        active
                          ? "border-indigo-600 bg-indigo-50/70 text-indigo-950 ring-1 ring-indigo-600"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
                      )}
                    >
                      <span className="text-xs font-bold">{preset.label}</span>
                      <span className="text-[10px] text-slate-500">{preset.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom dimensions if chosen */}
            {labelSize === "custom" ? (
              <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Width (mm)
                  </label>
                  <input
                    type="number"
                    min={20}
                    max={200}
                    value={customWidth}
                    onChange={(e) => setCustomWidth(Math.max(20, Math.min(200, Number(e.target.value) || 20)))}
                    className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2.5 font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Height (mm)
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={200}
                    value={customHeight}
                    onChange={(e) => setCustomHeight(Math.max(10, Math.min(200, Number(e.target.value) || 10)))}
                    className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2.5 font-bold text-slate-900"
                  />
                </div>
              </div>
            ) : null}

            {/* Bulk Quantity Presets */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Quick Quantities</label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: "1 Each", action: () => setAllQuantities(1) },
                  { label: "5 Each", action: () => setAllQuantities(5) },
                  { label: "10 Each", action: () => setAllQuantities(10) },
                  { label: "Match Stock", action: matchStockQuantities },
                ].map((btn) => (
                  <button
                    key={btn.label}
                    type="button"
                    onClick={btn.action}
                    disabled={selectedProducts.length === 0}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Selected Summary Badge */}
            <div className="flex items-center justify-between rounded-xl border border-indigo-100 bg-indigo-50/70 p-3 text-xs text-indigo-950">
              <div>
                <span className="font-bold text-sm text-indigo-900">{totalLabels}</span>
                <span className="ml-1 text-indigo-700">total labels to print</span>
                <p className="text-[11px] text-indigo-600 mt-0.5">
                  Across {selectedProducts.length} selected product{selectedProducts.length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="text-right">
                <span className="text-[11px] font-bold text-indigo-800 uppercase tracking-wide block">
                  {paperFormat === "a4"
                    ? `~${Math.ceil(totalLabels / a4Capacity.perPage) || 1} A4 page(s) (${a4Capacity.cols}×${a4Capacity.rows} grid)`
                    : `${totalLabels} thermal roll labels`}
                </span>
                <span className="text-[10px] text-indigo-600">
                  Label: {dimensions.widthMm} × {dimensions.heightMm} mm
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
              <Button
                size="lg"
                className="flex-1 font-bold shadow-sm"
                disabled={selectedProducts.length === 0}
                onClick={() => window.print()}
              >
                Print Barcodes ({totalLabels})
              </Button>
              <Button
                variant="secondary"
                size="lg"
                className="flex-1 font-semibold"
                disabled={selectedProducts.length === 0 || downloadingPdf}
                onClick={handleDownloadPdf}
              >
                {downloadingPdf ? "Generating PDF…" : "Download PDF"}
              </Button>
            </div>
          </div>

          {/* Live Print Preview Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">
                  3. Live Print Preview
                </h2>
                <p className="text-[11px] text-slate-500">
                  {paperFormat === "a4" ? "Previewing tiled A4 sheet grid" : "Previewing single thermal roll label"}
                </p>
              </div>
              {loadingSvgs ? (
                <span className="text-[11px] text-indigo-600 animate-pulse font-medium">
                  Generating preview…
                </span>
              ) : null}
            </div>

            {selectedProducts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-xs text-slate-400">
                Select products from the left table to see their barcode label preview.
              </div>
            ) : (
              <div className="max-h-[380px] overflow-y-auto rounded-xl border border-slate-200 bg-slate-100 p-4 flex flex-wrap gap-2.5 items-center justify-center">
                {selectedProducts.slice(0, 8).map((product) => {
                  const svg = barcodeSvgs[product.barcode!] || "";
                  const qty = quantities[product.id] || 1;

                  return (
                    <div key={product.id} className="flex flex-col items-center gap-1">
                      <div
                        style={{
                          width: `${Math.max(130, dimensions.widthMm * 3.6)}px`,
                          minHeight: `${Math.max(80, dimensions.heightMm * 3.6)}px`,
                        }}
                        className="rounded-lg border border-slate-300 bg-white p-2 shadow-xs flex flex-col justify-between"
                      >
                        {/* Header: NEXORA + Price */}
                        <div className="flex items-center justify-between border-b border-slate-100 pb-1 text-[10px] font-black leading-none">
                          <span className="tracking-tight text-slate-900">NEXORA</span>
                          <span className="text-slate-950 font-extrabold">
                            {formatMoney(product.priceInPaise)}
                          </span>
                        </div>

                        {/* Title */}
                        <p className="line-clamp-1 text-[10px] font-bold text-slate-900 text-center my-0.5">
                          {product.name}
                        </p>

                        {/* Vector Barcode */}
                        <div className="my-0.5 flex justify-center h-8 w-full overflow-hidden items-center">
                          {svg ? (
                            <div
                              dangerouslySetInnerHTML={{ __html: svg }}
                              className="w-full h-full [&>svg]:w-full [&>svg]:h-full [&>svg]:max-h-8"
                            />
                          ) : (
                            <div className="h-6 w-full animate-pulse bg-slate-200 rounded" />
                          )}
                        </div>

                        {/* Barcode Number & SKU */}
                        <p className="font-mono text-[9px] font-black text-slate-900 text-center tracking-wider leading-none">
                          {product.barcode}
                        </p>
                        {!dimensions.isSmall ? (
                          <p className="text-[8px] text-slate-500 font-medium text-center truncate mt-0.5 leading-none">
                            SKU {product.sku}
                            {product.brand ? ` · ${product.brand}` : ""}
                          </p>
                        ) : null}
                      </div>

                      <span className="text-[10px] font-semibold text-slate-500">
                        {qty} {qty === 1 ? "copy" : "copies"}
                      </span>
                    </div>
                  );
                })}

                {selectedProducts.length > 8 ? (
                  <p className="w-full text-center text-xs text-slate-500 font-medium pt-2">
                    + {selectedProducts.length - 8} more product label(s) in print queue
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </section>
      </div>
      </div>

      {/* HIDDEN PRINT CONTAINER (Rendered strictly during window.print()) */}
      <div className="barcode-print-area hidden print:block">
        {paperFormat === "thermal" ? (
          // Thermal Continuous Roll Printing (Each label is its own page matching label dimensions)
          printableItems.map((item, index) => {
            const svg = barcodeSvgs[item.barcode!] || "";
            return (
              <div
                key={`${item.id}-${index}`}
                style={{
                  width: `${dimensions.widthMm}mm`,
                  height: `${dimensions.heightMm}mm`,
                  boxSizing: "border-box",
                }}
                className="barcode-label-thermal p-1 flex flex-col justify-between overflow-hidden bg-white text-black"
              >
                {/* Brand & Price */}
                <div className="flex items-center justify-between text-[7pt] font-black leading-none">
                  <span>NEXORA</span>
                  <span>{formatMoney(item.priceInPaise)}</span>
                </div>

                {/* Name */}
                <div className="text-[6pt] font-semibold leading-tight text-center line-clamp-1">
                  {item.name}
                </div>

                {/* Vector Barcode */}
                <div className="my-0.5 flex justify-center items-center h-[38%] w-full overflow-hidden">
                  {svg ? (
                    <div
                      dangerouslySetInnerHTML={{ __html: svg }}
                      className="w-full h-full [&>svg]:w-full [&>svg]:h-full"
                    />
                  ) : null}
                </div>

                {/* Barcode Number & SKU */}
                <div className="text-center font-mono text-[6pt] font-bold leading-none tracking-wider">
                  {item.barcode}
                </div>
                {!dimensions.isSmall ? (
                  <div className="text-center text-[5pt] text-gray-700 truncate leading-none">
                    SKU {item.sku}
                    {item.brand ? ` · ${item.brand}` : ""}
                  </div>
                ) : null}
              </div>
            );
          })
        ) : (
          // A4 Sticker Sheet Printing (Tiled in a clean multi-column grid across A4 pages)
          <div className="barcode-grid-a4">
            {printableItems.map((item, index) => {
              const svg = barcodeSvgs[item.barcode!] || "";
              return (
                <div
                  key={`${item.id}-${index}`}
                  style={{
                    width: `${dimensions.widthMm}mm`,
                    height: `${dimensions.heightMm}mm`,
                    boxSizing: "border-box",
                  }}
                  className="barcode-label-a4 rounded border border-slate-300 p-1 flex flex-col justify-between bg-white text-black"
                >
                  <div className="flex items-center justify-between text-[7.5pt] font-black leading-none">
                    <span>NEXORA</span>
                    <span>{formatMoney(item.priceInPaise)}</span>
                  </div>

                  <div className="text-[6.5pt] font-semibold leading-tight text-center line-clamp-1">
                    {item.name}
                  </div>

                  <div className="my-0.5 flex justify-center items-center h-[38%] w-full overflow-hidden">
                    {svg ? (
                      <div
                        dangerouslySetInnerHTML={{ __html: svg }}
                        className="w-full h-full [&>svg]:w-full [&>svg]:h-full"
                      />
                    ) : null}
                  </div>

                  <div className="text-center font-mono text-[6.5pt] font-bold leading-none tracking-wider">
                    {item.barcode}
                  </div>
                  {!dimensions.isSmall ? (
                    <div className="text-center text-[5pt] text-gray-600 truncate leading-none">
                      SKU {item.sku}
                      {item.brand ? ` · ${item.brand}` : ""}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
