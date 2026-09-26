import Link from "next/link";

import { buttonClasses } from "@/components/ui/Button";

export function Pagination({
  page,
  totalPages,
  basePath = "/products",
  query = {},
}: {
  page: number;
  totalPages: number;
  basePath?: string;
  query?: Record<string, string>;
}) {
  if (totalPages <= 1) return null;

  const buildHref = (target: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value) params.set(key, value);
    }
    if (target > 1) params.set("page", String(target));
    const queryString = params.toString();
    return queryString ? `${basePath}?${queryString}` : basePath;
  };

  return (
    <nav aria-label="Pagination" className="mt-8 flex items-center justify-between gap-3">
      {page > 1 ? (
        <Link href={buildHref(page - 1)} className={buttonClasses("secondary", "sm")} rel="prev">
          Previous
        </Link>
      ) : (
        <span className={buttonClasses("secondary", "sm", "opacity-50")} aria-disabled="true">
          Previous
        </span>
      )}

      <p className="text-sm text-slate-600">
        Page <span className="font-semibold">{page}</span> of {totalPages}
      </p>

      {page < totalPages ? (
        <Link href={buildHref(page + 1)} className={buttonClasses("secondary", "sm")} rel="next">
          Next
        </Link>
      ) : (
        <span className={buttonClasses("secondary", "sm", "opacity-50")} aria-disabled="true">
          Next
        </span>
      )}
    </nav>
  );
}
