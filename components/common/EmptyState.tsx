import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-indigo-200 bg-gradient-to-br from-indigo-50/80 to-white px-6 py-12 text-center shadow-sm">
      <span aria-hidden="true" className="h-2 w-2 rounded-full bg-indigo-500 ring-4 ring-indigo-100" />
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {description ? <p className="max-w-md text-sm text-slate-600">{description}</p> : null}
      {action}
    </div>
  );
}
