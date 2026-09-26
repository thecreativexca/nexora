/** Shared catalog rules used by both the UI and the server-side queries. */

export const CATALOG_PAGE_SIZE = 12;
export const HOMEPAGE_FEATURED_LIMIT = 8;
export const HOMEPAGE_LATEST_LIMIT = 8;
export const SEARCH_SUGGESTION_LIMIT = 5;

/** Search input longer than this is rejected instead of being regex-escaped. */
export const SEARCH_MAX_LENGTH = 60;
export const SEARCH_MIN_LENGTH = 2;

/** Cart rules - enforced on the client for UX and again on the server. */
export const MAX_LINE_QUANTITY = 99;
export const MAX_CART_LINES = 50;

export const CATALOG_SORTS = [
  "newest",
  "price_asc",
  "price_desc",
  "name_asc",
] as const;
export type CatalogSort = (typeof CATALOG_SORTS)[number];
export const DEFAULT_CATALOG_SORT: CatalogSort = "newest";

export const CATALOG_SORT_LABELS: Record<CatalogSort, string> = {
  newest: "Newest first",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
  name_asc: "Name: A to Z",
};

export const CATEGORY_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
