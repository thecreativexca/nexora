import type { ReactNode } from "react";

import Link from "next/link";
import { Logo } from "@/components/common/Logo";

/** Centered auth card used by the pre-sign-in POS pages. */
export default function PosPublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-10">
      <div aria-hidden="true" className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-indigo-600/30 blur-3xl" />
      <div aria-hidden="true" className="absolute -bottom-32 -right-24 h-80 w-80 rounded-full bg-cyan-500/20 blur-3xl" />
      <div className="w-full max-w-md">
        <div className="relative mb-6 flex flex-col items-center text-center">
          <Logo className="[&_span]:text-white" />
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300">Staff portal</p>
        </div>
        <div className="relative rounded-3xl border border-white/10 bg-white p-6 shadow-2xl shadow-black/30 sm:p-8">
          {children}
        </div>
        <p className="relative mt-6 text-center text-xs text-slate-400">
          <Link href="/" className="font-medium hover:text-white">
            &larr; Back to the shop
          </Link>
        </p>
      </div>
    </div>
  );
}
