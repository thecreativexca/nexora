/** Inline SVG icon set - keeps the dependency list small and styles consistent. */

interface IconProps {
  className?: string;
  "aria-hidden"?: boolean;
}

const base = "h-5 w-5";

export function BagIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M6 8h12l-1 12H7L6 8Z" strokeLinejoin="round" />
      <path d="M9 8V6.5a3 3 0 0 1 6 0V8" strokeLinecap="round" />
    </svg>
  );
}

export function SearchIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" strokeLinecap="round" />
    </svg>
  );
}

export function CloseIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
    </svg>
  );
}

export function UserIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c1.2-3.4 4-5 7-5s5.8 1.6 7 5" strokeLinecap="round" />
    </svg>
  );
}

export function CheckIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="m5 13 4.5 4.5L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AlertIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M12 4l9 16H3l9-16Z" strokeLinejoin="round" />
      <path d="M12 10v4.5M12 17.4v.2" strokeLinecap="round" />
    </svg>
  );
}

export function TruckIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M3 7h10v9H3zM13 10h4l3 3v3h-7z" strokeLinejoin="round" />
      <circle cx="7" cy="18" r="1.6" />
      <circle cx="17" cy="18" r="1.6" />
    </svg>
  );
}

export function ShieldIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M12 3.5 19 6v6c0 4.2-2.9 7.3-7 8.5-4.1-1.2-7-4.3-7-8.5V6l7-2.5Z" strokeLinejoin="round" />
      <path d="m9.2 12.2 2 2 3.6-3.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function WrenchIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M15.5 4.5a4.5 4.5 0 0 0-5.8 6.1L4.8 15.5a2 2 0 0 0 0 2.8l.9.9a2 2 0 0 0 2.8 0l4.7-5a4.5 4.5 0 0 0 6.1-5.8l-2.7 2.7-2.3-.6-.6-2.3 2.8-2.7Z" strokeLinejoin="round" />
    </svg>
  );
}

export function PlusIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

export function MinusIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

export function TrashIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M5 7h14M10 7V5.5h4V7M8 7l.8 12h6.4L16 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Official 4-colour Google "G" mark. Uses brand fills, not currentColor. */
export function GoogleIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.54 5.54 0 0 1-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.1A11.99 11.99 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29A7.2 7.2 0 0 1 4.89 12c0-.81.14-1.57.38-2.29v-3.1H1.29A11.99 11.99 0 0 0 0 12c0 1.94.46 3.77 1.29 5.39l3.98-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42A11.97 11.97 0 0 0 12 0 11.99 11.99 0 0 0 1.29 6.61l3.98 3.1C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}

export function MailIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="m4.5 8 7.5 5 7.5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LockIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <rect x="5" y="10.5" width="14" height="9" rx="2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" strokeLinecap="round" />
    </svg>
  );
}

export function RefreshIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M20 12a8 8 0 1 1-2.3-5.6" strokeLinecap="round" />
      <path d="M20 4v4.5h-4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
