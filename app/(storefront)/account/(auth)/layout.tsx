import type { ReactNode } from "react";

/** Centered card shell shared by the sign-in and registration screens. */
export default function AccountAuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 sm:px-6 lg:py-14">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        {children}
      </div>
    </div>
  );
}
