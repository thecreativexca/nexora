import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-indigo-600 text-white shadow-sm shadow-indigo-950/15 hover:bg-indigo-700 hover:shadow-md disabled:bg-slate-300 disabled:shadow-none",
  secondary:
    "border border-slate-200 bg-white text-slate-800 shadow-sm hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 disabled:text-slate-400 disabled:hover:bg-white",
  ghost: "text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 disabled:text-slate-400",
  danger: "bg-rose-600 text-white shadow-sm hover:bg-rose-700 disabled:bg-rose-200",
  success: "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 disabled:bg-emerald-200",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-5 text-sm",
  lg: "h-12 px-6 text-base",
};

/** Shared class builder so links and buttons stay visually identical. */
export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  extra?: string,
): string {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-200",
    "disabled:cursor-not-allowed disabled:opacity-90",
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    extra,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses(variant, size, cn(fullWidth && "w-full", className))}
      {...rest}
    >
      {children}
    </button>
  );
}
