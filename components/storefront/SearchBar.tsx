"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Spinner } from "@/components/ui/Spinner";
import { SearchIcon } from "@/components/ui/icons";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { SEARCH_MIN_LENGTH, SEARCH_SUGGESTION_LIMIT } from "@/lib/constants/catalog";
import { cn } from "@/lib/utils/cn";
import { formatMoney } from "@/lib/utils/money";
import type { ProductSummary } from "@/types/catalog";

/**
 * Header search. Submitting navigates to the server-rendered listing page
 * (so search works without JavaScript), while suggestions come from the
 * /api/products endpoint.
 */
export function SearchBar({ className }: { className?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";
  const categorySlug = searchParams.get("category") ?? "";

  /** `null` means "mirror the URL" - typing takes over until the next search. */
  const [draft, setDraft] = useState<string | null>(null);
  const query = draft ?? urlQuery;

  const [result, setResult] = useState<{ term: string; items: ProductSummary[] }>({
    term: "",
    items: [],
  });
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const debouncedQuery = useDebouncedValue(query, 300);

  const trimmedQuery = query.trim();
  const term = debouncedQuery.trim();
  const isSearchable = term.length >= SEARCH_MIN_LENGTH;

  /** Suggestions + loading are derived, so the effect only writes async results. */
  const suggestions = isSearchable && result.term === term ? result.items : [];
  const isLoading = isSearchable && result.term !== term;
  const showEmptyMessage = suggestions.length === 0 && !isLoading;

  useEffect(() => {
    if (!isSearchable) return;

    const controller = new AbortController();
    fetch(`/api/products?q=${encodeURIComponent(term)}&pageSize=${SEARCH_SUGGESTION_LIMIT}`, {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : { products: [] }))
      .then((data: { products?: ProductSummary[] }) => {
        setResult({ term, items: data.products ?? [] });
        setActiveIndex(-1);
      })
      .catch(() => {
        // Aborted request or offline - keep whatever was shown before.
      });

    return () => controller.abort();
  }, [term, isSearchable]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const goToResults = () => {
    const params = new URLSearchParams();
    const searchTerm = query.trim();
    if (searchTerm) params.set("q", searchTerm);
    if (categorySlug) params.set("category", categorySlug);
    const queryString = params.toString();
    setIsOpen(false);
    setDraft(null);
    router.push(queryString ? `/products?${queryString}` : "/products");
  };

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          goToResults();
        }}
        className="relative"
      >
        <label htmlFor="nexora-search" className="sr-only">
          Search products
        </label>
        <input
          id="nexora-search"
          type="search"
          value={query}
          autoComplete="off"
          placeholder="Search phones, laptops, accessories..."
          role="combobox"
          aria-expanded={isOpen}
          aria-controls="nexora-search-suggestions"
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `nexora-suggestion-${activeIndex}` : undefined}
          onChange={(event) => {
            setDraft(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            if (trimmedQuery.length >= SEARCH_MIN_LENGTH) setIsOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              if (suggestions.length > 0) {
                setIsOpen(true);
                setActiveIndex((index) => (index + 1) % suggestions.length);
              }
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              if (suggestions.length > 0) {
                setIsOpen(true);
                setActiveIndex((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
              }
              return;
            }
            if (event.key === "Enter") {
              const active = suggestions[activeIndex];
              if (isOpen && active) {
                event.preventDefault();
                setIsOpen(false);
                router.push(`/products/${active.slug}`);
              }
              return;
            }
            if (event.key === "Escape") {
              setIsOpen(false);
              setActiveIndex(-1);
            }
          }}
          className="h-11 w-full rounded-lg border border-slate-300 bg-slate-50 pl-10 pr-10 text-sm text-slate-900 placeholder:text-slate-500 focus:border-slate-900 focus:bg-white"
        />
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
          <SearchIcon className="h-4 w-4" />
        </span>
        {isLoading ? (
          <span className="absolute right-3 top-1/2 -translate-y-1/2">
            <Spinner label="Searching products" />
          </span>
        ) : null}
      </form>

      {isOpen ? (
        <ul
          id="nexora-search-suggestions"
          role="listbox"
          aria-label="Product suggestions"
          className="absolute left-0 right-0 top-12 z-40 max-h-80 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl"
        >
          {suggestions.map((product, index) => (
            <li key={product.id}>
              <Link
                id={`nexora-suggestion-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                href={`/products/${product.slug}`}
                onClick={() => setIsOpen(false)}
                className={cn(
                  "flex items-center justify-between gap-3 px-3 py-2 text-sm",
                  index === activeIndex ? "bg-slate-100" : "hover:bg-slate-50",
                )}
              >
                <span className="truncate font-medium text-slate-800">{product.name}</span>
                <span className="shrink-0 text-xs text-slate-500">
                  {formatMoney(product.priceInPaise)}
                </span>
              </Link>
            </li>
          ))}

          {showEmptyMessage ? (
            <li className="px-3 py-3 text-sm text-slate-500">
              {trimmedQuery.length < SEARCH_MIN_LENGTH
                ? `Type at least ${SEARCH_MIN_LENGTH} characters to see suggestions.`
                : `No products match “${trimmedQuery}”.`}
            </li>
          ) : null}

          {suggestions.length > 0 ? (
            <li className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
              Press Enter to see all matching products.
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

