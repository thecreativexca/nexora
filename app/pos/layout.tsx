import type { ReactNode } from "react";

/** Bare shell for the whole /pos staff portal (no storefront chrome). */
export default function PosLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-full bg-slate-50 text-slate-900">{children}</div>;
}