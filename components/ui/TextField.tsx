import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils/cn";

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  name: string;
  error?: string | null;
  hint?: string;
  optional?: boolean;
}

export function TextField({
  label,
  name,
  error,
  hint,
  optional = false,
  className,
  ...rest
}: TextFieldProps) {
  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium text-slate-800">
        {label}
        {optional ? <span className="ml-1 text-slate-400">(optional)</span> : null}
      </label>
      <input
        id={name}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={cn(error ? errorId : undefined, hint ? hintId : undefined) || undefined}
        className={cn(
          "h-11 w-full rounded-lg border bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400",
          error ? "border-rose-400" : "border-slate-300",
          "focus:border-slate-900 focus:ring-0",
          className,
        )}
        {...rest}
      />
      {hint && !error ? (
        <p id={hintId} className="text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs font-medium text-rose-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
