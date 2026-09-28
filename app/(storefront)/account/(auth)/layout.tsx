import type { ReactNode } from "react";

/** Centered card shell shared by the sign-in and registration screens. */
export default function AccountAuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-12 sm:px-6 lg:py-16">
      <div className="mb-5 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-indigo-600">Nexora account</p>
        <p className="mt-2 text-sm text-slate-500">One account for orders, profile and support</p>
      </div>
      <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xl shadow-slate-900/5 sm:p-8">
        {children}
      </div>
    </div>
  );
}
