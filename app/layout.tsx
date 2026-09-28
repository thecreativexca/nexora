import type { Metadata } from "next";

import "./globals.css";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "Nexora - electronics, accessories and services",
    template: "%s | Nexora",
  },
  description:
    "Shop phones, laptops, tablets, accessories and in-house repair services from Nexora with secure online payment.",
};

/**
 * Bare shell used by every route. The public storefront chrome (header, cart,
 * footer) lives in `app/(storefront)/layout.tsx` so the /pos staff portal gets
 * its own chrome-free surface.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col text-slate-900">
        {children}
      </body>
    </html>
  );
}
