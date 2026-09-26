import Link from "next/link";

import { SERVICE_FACTS } from "@/lib/constants/catalog-facts";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-slate-50">
      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-lg font-black tracking-tight text-slate-900">NEXORA</p>
            <p className="mt-2 text-sm text-slate-600">
              Electronics retail, service and repair. Shop online today - in-store POS and
              management tools land in the next phase.
            </p>
          </div>

          <nav aria-label="Shop">
            <h2 className="text-sm font-semibold text-slate-900">Shop</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li>
                <Link href="/products" className="hover:text-slate-900">
                  All products
                </Link>
              </li>
              <li>
                <Link href="/products?category=services" className="hover:text-slate-900">
                  Services
                </Link>
              </li>
              <li>
                <Link href="/checkout" className="hover:text-slate-900">
                  Checkout
                </Link>
              </li>
            </ul>
          </nav>

          <div>
            <h2 className="text-sm font-semibold text-slate-900">How we work</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              {SERVICE_FACTS.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-slate-900">Order help</h2>
            <p className="mt-3 text-sm text-slate-600">
              Have your order number (for example NX-20260921-K7M2QF) ready and our team can look
              up the order instantly.
            </p>
          </div>
        </div>

        <p className="mt-10 border-t border-slate-200 pt-6 text-xs text-slate-500">
          &copy; {new Date().getFullYear()} Nexora. Prices include applicable taxes. Payment is
          collected on delivery.
        </p>
      </div>
    </footer>
  );
}
