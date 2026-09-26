/** Slug + SKU normalisation shared by the seed script and any future admin UI. */

export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function normalizeSku(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "-");
}

export function buildProductSku(prefix: string, sequence: number): string {
  return normalizeSku(`${prefix}-${String(sequence).padStart(4, "0")}`);
}
