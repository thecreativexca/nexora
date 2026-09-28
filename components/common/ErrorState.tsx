import type { ReactNode } from "react";

import { AlertIcon } from "@/components/ui/icons";

/** Shown when a data source (MongoDB) is unreachable - never a raw error page. */
export function ErrorState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white px-6 py-12 text-center shadow-sm"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700">
        <AlertIcon />
      </span>
      <h3 className="text-base font-semibold text-amber-900">{title}</h3>
      <p className="max-w-lg text-sm text-amber-800">{description}</p>
      {action}
    </div>
  );
}
