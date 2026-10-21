"use client";

import type { InputHTMLAttributes } from "react";
import { useState } from "react";

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
  const [passwordVisible, setPasswordVisible] = useState(false);
  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;
  const isPassword = rest.type === "password";

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-semibold text-slate-700">
        {label}
        {optional ? <span className="ml-1 text-slate-400">(optional)</span> : null}
      </label>
      <div className="relative">
        <input
          id={name}
          name={name}
          suppressHydrationWarning
          aria-invalid={error ? true : undefined}
          aria-describedby={cn(error ? errorId : undefined, hint ? hintId : undefined) || undefined}
          className={cn(
            "h-11 w-full rounded-xl border bg-white px-3.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400",
            isPassword ? "pr-16" : "",
            error ? "border-rose-400" : "border-slate-300",
            "focus:border-indigo-500 focus:ring-0",
            className,
          )}
          {...rest}
          type={isPassword && passwordVisible ? "text" : rest.type}
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setPasswordVisible((visible) => !visible)}
            className="absolute inset-y-0 right-0 flex min-w-14 items-center justify-center rounded-r-xl px-3 text-xs font-semibold text-slate-500 hover:text-indigo-700"
            aria-label={passwordVisible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
            aria-pressed={passwordVisible}
          >
            {passwordVisible ? "Hide" : "Show"}
          </button>
        ) : null}
      </div>
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
