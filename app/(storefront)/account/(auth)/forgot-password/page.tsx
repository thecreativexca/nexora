import type { Metadata } from "next"; import { PasswordResetForm } from "@/components/account/PasswordResetForm";
export const metadata: Metadata = { title: "Reset password", robots: { index: false, follow: false } };
export default function ForgotPasswordPage() { return <><header className="mb-6"><h1 className="text-2xl font-bold tracking-tight text-slate-900">Reset your password</h1><p className="mt-1 text-sm text-slate-600">We’ll email a secure, one-time code if the account is eligible.</p></header><PasswordResetForm /></>; }
