import type { ReactNode } from "react";

export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="max-w-2xl">
        <span aria-hidden="true" className="mb-2 block h-1 w-10 rounded-full bg-indigo-600" />
        <h2 className="text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">{title}</h2>
        {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
