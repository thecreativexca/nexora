"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/Button";

/**
 * Global error boundary. Never renders raw error text to the customer - the
 * details stay in the server/browser console for the developer.
 */
export default function GlobalRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[nexora] Unhandled UI error", { digest: error.digest, message: error.message });
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6 lg:px-8">
      <div
        role="alert"
        className="flex flex-col items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-6 py-12 text-center"
      >
        <h1 className="text-lg font-semibold text-amber-900">Something went wrong</h1>
        <p className="max-w-md text-sm text-amber-800">
          The page could not be rendered. Your bag is stored on this device, so nothing has been
          lost. Please try again.
        </p>
        <Button onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
