import Link from "next/link";
import { Suspense, type ReactNode } from "react";

import { AccountMenuLink } from "@/components/account/AccountMenuLink";
import { Logo } from "@/components/common/Logo";
import { CartButton } from "@/components/cart/CartButton";
import { SearchBar } from "@/components/storefront/SearchBar";
import { listActiveCategoriesSafe } from "@/lib/services/category.service";

/**
 * Server-rendered storefront header.
 *
 * Categories come from MongoDB; if the database is unreachable the shell still
 * renders (degraded navigation) instead of taking the whole app down.
 */
export async function SiteHeader() {
  const categories = await listActiveCategoriesSafe();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 shadow-[0_1px_12px_rgba(15,23,42,0.04)] backdrop-blur-xl">
      <div className="bg-slate-950 px-4 py-1.5 text-center text-[11px] font-semibold tracking-wide text-slate-200 sm:text-xs">
        Flexible offline payments · Verified products · Reliable support
      </div>
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 py-3">
          <Link href="/" aria-label="Nexora home" className="shrink-0 rounded-lg">
            <Logo />
          </Link>

          <div className="hidden min-w-0 flex-1 md:block">
            <Suspense fallback={<SearchBarPlaceholder />}>
              <SearchBar />
            </Suspense>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Suspense fallback={<AccountLinkPlaceholder />}>
              <AccountMenuLink />
            </Suspense>
            <CartButton />
          </div>
        </div>

        <div className="pb-3 md:hidden">
          <Suspense fallback={<SearchBarPlaceholder />}>
            <SearchBar />
          </Suspense>
        </div>

        <nav aria-label="Product categories" className="flex items-center gap-1 overflow-x-auto pb-2">
          <NavLink href="/products">All products</NavLink>
          {categories.map((category) => (
            <NavLink key={category.slug} href={`/products?category=${category.slug}`}>
              {category.name}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
            className="shrink-0 whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-indigo-50 hover:text-indigo-700"
    >
      {children}
    </Link>
  );
}

/** Skeleton shown while the client search box boots. */
function SearchBarPlaceholder() {
  return (
    <div
      aria-hidden="true"
      className="h-11 w-full animate-pulse rounded-xl border border-slate-200 bg-slate-50"
    />
  );
}

/** Skeleton shown while the session-aware account link resolves. */
function AccountLinkPlaceholder() {
  return (
    <div
      aria-hidden="true"
      className="hidden h-11 w-24 animate-pulse rounded-xl bg-slate-100 sm:block"
    />
  );
}
