import type { ReactNode } from "react";
import Link from "next/link";

import { Logo } from "@/components/common/Logo";
import { GoogleIcon, LockIcon } from "@/components/ui/icons";

/** Centered card shell shared by the sign-in and registration screens. */
export default function AccountAuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center px-4 py-12 sm:px-6 lg:py-16">
      <Link href="/" className="mb-8 transition-opacity hover:opacity-80">
        <Logo />
      </Link>

      <div className="relative w-full overflow-hidden rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xl shadow-indigo-950/5 sm:p-8">
        {/* subtle brand gradient along the card's top edge */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-400"
        />
        {children}
      </div>

      <p className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <LockIcon className="h-3.5 w-3.5" />
          Your data stays private and secure
        </span>
        <span className="inline-flex items-center gap-1.5">
          <GoogleIcon className="h-3.5 w-3.5" />
          One-tap sign-in with Google
        </span>
      </p>
    </div>
  );
}

