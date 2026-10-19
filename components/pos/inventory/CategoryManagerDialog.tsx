"use client";

import { useEffect, useState, type FormEvent } from "react";

import { getJson, postJson } from "@/components/pos/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CloseIcon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/Spinner";
import { TextField } from "@/components/ui/TextField";

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  image: string;
  isActive: boolean;
  productCount: number;
}

/**
 * Category management: create a category and see all existing ones with their
 * product counts. New categories immediately become available in the product
 * form's category dropdown.
 */
export function CategoryManagerDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (category: { id: string; name: string }) => void;
}) {
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [createdMessage, setCreatedMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setLoadError(null);

      const result = await getJson<CategoryRow[]>("/api/pos/categories");
      if (cancelled) return;

      setLoading(false);
      if (result.ok) {
        setCategories(result.data);
      } else {
        setLoadError(result.message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setFieldErrors({});
    setFormError(null);
    setCreatedMessage(null);
    setIsSubmitting(true);

    const result = await postJson<CategoryRow>("/api/pos/categories", {
      name: name.trim(),
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(image.trim() ? { image: image.trim() } : {}),
    });

    if (result.ok) {
      setCategories((current) =>
        [...current, result.data].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setCreatedMessage(`“${result.data.name}” was created.`);
      onCreated({ id: result.data.id, name: result.data.name });
      setName("");
      setDescription("");
      setImage("");
      setIsSubmitting(false);
      return;
    }

    const mapped: Record<string, string> = {};
    for (const [field, messages] of Object.entries(result.fieldErrors)) {
      mapped[field] = messages[0] ?? "Invalid value.";
    }
    setFieldErrors(mapped);
    setFormError(result.message);
    setIsSubmitting(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="category-manager-title"
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="category-manager-title" className="text-base font-bold text-slate-900">
              Categories
            </h2>
            <p className="text-xs text-slate-500">
              Create categories to organise the catalogue and the storefront.
            </p>
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

        <div className="space-y-6 px-5 py-4">
          <form
            onSubmit={handleSubmit}
            noValidate
            className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4"
          >
            <h3 className="text-sm font-bold text-slate-900">Add a category</h3>

            {formError ? (
              <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {formError}
              </p>
            ) : null}

            {createdMessage ? (
              <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {createdMessage}
              </p>
            ) : null}

            <TextField
              name="categoryName"
              label="Category name"
              required
              autoComplete="off"
              placeholder="e.g. Mobile Accessories"
              value={name}
              error={fieldErrors.name}
              onChange={(event) => setName(event.target.value)}
            />

            <div className="flex flex-col gap-1.5">
              <label htmlFor="categoryDescription" className="text-sm font-semibold text-slate-700">
                Description <span className="ml-1 text-slate-400">(optional)</span>
              </label>
              <textarea
                id="categoryDescription"
                name="categoryDescription"
                rows={2}
                maxLength={500}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:ring-0"
                placeholder="Short description shown on the storefront"
              />
            </div>

            <TextField
              name="categoryImage"
              label="Image URL"
              optional
              autoComplete="off"
              placeholder="/images/categories/accessories.jpg"
              value={image}
              error={fieldErrors.image}
              onChange={(event) => setImage(event.target.value)}
            />

            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Spinner label="Creating the category" /> Creating...
                </>
              ) : (
                "Create category"
              )}
            </Button>
          </form>

          <section aria-labelledby="existing-categories">
            <div className="flex items-center justify-between">
              <h3 id="existing-categories" className="text-sm font-bold text-slate-900">
                Existing categories
              </h3>
              <span className="text-xs text-slate-500">
                {categories.length} total
              </span>
            </div>

            {loading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
                <Spinner /> Loading categories…
              </div>
            ) : loadError ? (
              <div className="mt-3 rounded-lg bg-rose-50 px-3 py-3 text-sm text-rose-700">
                <p>{loadError}</p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-2"
                  onClick={() => setReloadKey((current) => current + 1)}
                >
                  Retry
                </Button>
              </div>
            ) : categories.length === 0 ? (
              <p className="mt-3 rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-500">
                No categories yet. Create your first one above.
              </p>
            ) : (
              <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">Category</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Products</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {categories.map((category) => (
                      <tr key={category.id}>
                        <td className="px-4 py-2.5">
                          <p className="font-semibold text-slate-900">{category.name}</p>
                          <p className="text-xs text-slate-500">/{category.slug}</p>
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-600">
                          {category.productCount}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {category.isActive ? (
                            <Badge tone="success">Active</Badge>
                          ) : (
                            <Badge tone="neutral">Inactive</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
