import { GoogleIcon, MailIcon } from "@/components/ui/icons";

/**
 * Google sign-in entry point plus the divider that leads into the manual
 * email/password form. Google is intentionally the only social provider.
 */
export function SocialLoginButtons({
  next,
  dividerLabel = "or, continue with email",
}: {
  next: string;
  dividerLabel?: string;
}) {
  const target = encodeURIComponent(next);

  return (
    <div className="space-y-4">
      <a
        href={`/api/account/oauth/google?next=${target}`}
        className="inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-800 shadow-sm transition-all duration-200 hover:border-slate-400 hover:bg-slate-50 hover:shadow"
      >
        <GoogleIcon className="h-[18px] w-[18px]" />
        Continue with Google
      </a>

      <div className="flex items-center gap-3 py-1" aria-hidden="true">
        <span className="h-px flex-1 bg-slate-200" />
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <MailIcon className="h-3.5 w-3.5" />
          {dividerLabel}
        </span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>
    </div>
  );
}

