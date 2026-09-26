import Image from "next/image";

import { cn } from "@/lib/utils/cn";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        aria-hidden="true"
        className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-sm font-black tracking-tight text-white"
      >
        NX
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-lg font-black tracking-tight text-slate-900">NEXORA</span>
        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
          POS &amp; Storefront
        </span>
      </span>
    </span>
  );
}

/** Small reusable image used inside marketing/hero sections. */
export function HeroImage({ src, alt }: { src: string; alt: string }) {
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes="(max-width: 1024px) 100vw, 480px"
      className="object-contain"
      priority
    />
  );
}
