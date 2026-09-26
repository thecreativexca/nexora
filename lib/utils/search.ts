import { SEARCH_MAX_LENGTH } from "@/lib/constants/catalog";

/**
 * Search helpers.
 *
 * User input is never concatenated into a regular expression directly.
 * `escapeRegExp` neutralises every regex metacharacter so a query such as
 * "a(b" or ".*" is matched literally instead of leaking into the query.
 */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeSearchTerm(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SEARCH_MAX_LENGTH);
}

/** Case-insensitive, literal "contains" matcher for whitelisted fields. */
export function buildContainsRegExp(term: string): RegExp {
  return new RegExp(escapeRegExp(term), "i");
}

export function normalizeSlug(value: string | null | undefined): string {
  if (!value) return "";
  return value.trim().toLowerCase();
}
