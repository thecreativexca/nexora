import { cn } from "@/lib/utils/cn";

export function Logo({ className, compact = false, inverse = false }: { className?: string; compact?: boolean; inverse?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg aria-hidden="true" viewBox="0 0 48 48" className="h-10 w-10 shrink-0 drop-shadow-sm">
        <defs>
          <linearGradient id="nexora-mark" x1="6" y1="4" x2="42" y2="44" gradientUnits="userSpaceOnUse">
            <stop stopColor="#818cf8" />
            <stop offset="1" stopColor="#4338ca" />
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="44" height="44" rx="13" fill="url(#nexora-mark)" />
        <path d="M13 34V14l22 20V14" fill="none" stroke="white" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13 14h9M26 34h9" stroke="#c7d2fe" strokeWidth="3" strokeLinecap="round" />
      </svg>
      {!compact ? <span className="flex flex-col leading-none">
        <span className={cn("text-lg font-black tracking-tight", inverse ? "text-white" : "text-slate-950")}>NEXORA</span>
        <span className={cn("text-[11px] font-medium uppercase tracking-[0.18em]", inverse ? "text-slate-400" : "text-slate-500")}>
          Store &amp; operations
        </span>
      </span> : null}
    </span>
  );
}
