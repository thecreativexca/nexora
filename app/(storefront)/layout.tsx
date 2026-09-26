import type { ReactNode } from "react";

import { CartDrawer } from "@/components/cart/CartDrawer";
import { SiteFooter } from "@/components/common/SiteFooter";
import { SiteHeader } from "@/components/common/SiteHeader";
import { CartProvider } from "@/lib/cart/CartProvider";

/** Public storefront shell: header, cart, footer. Not present on /pos. */
export default function StorefrontLayout({ children }: { children: ReactNode }) {
  return (
    <CartProvider>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-slate-900 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <SiteFooter />
      <CartDrawer />
    </CartProvider>
  );
}