import type { CatalogSort } from "@/lib/constants/catalog";

export interface CategorySummary {
  id: string;
  name: string;
  slug: string;
  description: string;
  image: string;
  productCount: number;
}

export interface ProductSummary {
  id: string;
  name: string;
  slug: string;
  description: string;
  sku: string;
  priceInPaise: number;
  stock: number;
  isService: boolean;
  isFeatured: boolean;
  image: string;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
}

export interface ProductListResult {
  products: ProductSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CatalogQuery {
  search: string;
  categorySlug: string;
  sort: CatalogSort;
  page: number;
  pageSize: number;
  featuredOnly: boolean;
}

export interface CatalogFacets {
  categories: CategorySummary[];
  activeCategory: CategorySummary | null;
  categoryNotFound: boolean;
}
