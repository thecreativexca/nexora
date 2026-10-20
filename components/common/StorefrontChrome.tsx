"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const AUTH_ROUTES = new Set([
  "/account/login",
  "/account/register",
  "/account/forgot-password",
]);

/** Keeps public chrome off dedicated authentication screens without duplicating routes. */
export function StorefrontChrome({
  children,
  header,
  footer,
  cart,
}: {
  children: ReactNode;
  header: ReactNode;
  footer: ReactNode;
  cart: ReactNode;
}) {
  const pathname = usePathname();
  const isAuthScreen = AUTH_ROUTES.has(pathname);

  if (isAuthScreen) {
    return <main id="main-content" className="flex min-h-screen flex-1 items-center bg-slate-50">{children}</main>;
  }

  return (
    <>
      {header}
      <main id="main-content" className="flex-1">{children}</main>
      {footer}
      {cart}
    </>
  );
}
