import type { ReactNode } from "react";

import Link from "next/link";

/** Centered auth card used by the pre-sign-in POS pages. */
export default function PosPublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-slate-400">
            Nexora
          </p>
          <p className="mt-1 text-xs font-medium text-slate-500">Staff portal</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {children}
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">
          <Link href="/" className="hover:text-slate-600">
            &larr; Back to the shop
          </Link>
        </p>
      </div>
    </div>
  );
}