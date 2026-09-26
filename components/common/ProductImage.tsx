"use client";

import Image from "next/image";
import { useState } from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Product image with a graceful fallback: URLs come from the database, so a
 * missing or unreachable image must never break the layout.
 */
export function ProductImage({
  src,
  alt,
  sizes = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw",
  className,
  priority = false,
}: {
  src: string;
  alt: string;
  sizes?: string;
  className?: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const showFallback = !src || failed;

  return (
    <div
      className={cn(
        "relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg bg-slate-100",
        className,
      )}
    >
      {showFallback ? (
        <div className="flex flex-col items-center justify-center gap-1 p-4 text-center">
          <span aria-hidden="true" className="text-2xl font-black text-slate-300">
            {alt.slice(0, 1).toUpperCase()}
          </span>
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Image unavailable
          </span>
        </div>
      ) : (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          className="object-contain p-2"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
