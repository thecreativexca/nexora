import Link from "next/link";

import { SERVICE_FACTS } from "@/lib/constants/catalog-facts";

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-slate-800 bg-slate-950 text-slate-300">
      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-lg font-black tracking-tight text-white">NEXORA</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Electronics, accessories and repair services with a secure online store and
              a connected in-store operations team.
            </p>
          </div>

          <nav aria-label="Shop">
            <h2 className="text-sm font-semibold text-white">Shop</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-400">
              <li>
                <Link href="/products" className="hover:text-white">
                  All products
                </Link>
              </li>
              <li>
                <Link href="/products?category=services" className="hover:text-white">
                  Services
                </Link>
              </li>
              <li>
                <Link href="/checkout" className="hover:text-white">
                  Checkout
                </Link>
              </li>
            </ul>
          </nav>

          <div>
            <h2 className="text-sm font-semibold text-white">How we work</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-400">
              {SERVICE_FACTS.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-white">Order help</h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              Have your order number (for example NX-20260921-K7M2QF) ready and our team can look
              up the order instantly.
            </p>
          </div>
        </div>

        <p className="mt-10 border-t border-slate-800 pt-6 text-xs text-slate-500">
          &copy; {new Date().getFullYear()} Nexora. Prices include applicable taxes. Online orders
          are completed through secure prepaid checkout.
        </p>
      </div>
    </footer>
  );
}
