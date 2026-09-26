"use client";
import Link from "next/link"; import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button"; import { Spinner } from "@/components/ui/Spinner"; import { TextField } from "@/components/ui/TextField";
type Step = "email" | "otp" | "password" | "done";
async function post(path: string, body: unknown) { const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const data = await response.json() as { error?: { message?: string }; cooldownSeconds?: number }; if (!response.ok) throw new Error(data.error?.message ?? "We could not complete that request."); return data; }
export function PasswordResetForm() {
  const [step, setStep] = useState<Step>("email"); const [email, setEmail] = useState(""); const [otp, setOtp] = useState(""); const [password, setPassword] = useState(""); const [confirmPassword, setConfirmPassword] = useState(""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null); const [error, setError] = useState<string | null>(null); const [cooldown, setCooldown] = useState(0);
  useEffect(() => { if (cooldown <= 0) return; const timer = window.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000); return () => window.clearTimeout(timer); }, [cooldown]);
  async function submit(event: FormEvent) { event.preventDefault(); if (busy) return; setBusy(true); setError(null);
    try {
      if (step === "email") { const data = await post("/api/account/password-reset/request", { email }); setCooldown(data.cooldownSeconds ?? 60); setMessage("If an account exists for this email, a verification code has been sent."); setStep("otp"); }
      else if (step === "otp") { await post("/api/account/password-reset/verify", { email, otp }); setMessage(null); setStep("password"); }
      else if (step === "password") { await post("/api/account/password-reset/complete", { password, confirmPassword }); setStep("done"); }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Something went wrong."); } finally { setBusy(false); }
  }
  async function resend() { if (cooldown || busy) return; setBusy(true); setError(null); try { const data = await post("/api/account/password-reset/request", { email }); setCooldown(data.cooldownSeconds ?? 60); setOtp(""); setMessage("A new code has been requested. The previous code is no longer valid."); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not resend the code."); } finally { setBusy(false); } }
  if (step === "done") return <div className="space-y-4"><div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">Your password has been changed and all previous customer sessions were signed out.</div><Link href="/account/login" className="block rounded-lg bg-slate-900 px-4 py-3 text-center font-semibold text-white">Sign in with new password</Link></div>;
  return <form onSubmit={submit} className="space-y-4" noValidate>
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step {step === "email" ? 1 : step === "otp" ? 2 : 3} of 3</p>
    {message ? <div role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">{message}</div> : null}
    {error ? <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}
    {step === "email" ? <TextField name="email" label="Email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /> : null}
    {step === "otp" ? <><TextField name="otp" label="6-digit verification code" inputMode="numeric" autoComplete="one-time-code" required value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} hint="The code expires in 10 minutes and can be used once." /><div className="flex justify-between gap-3 text-sm"><button type="button" onClick={() => setStep("email")} className="font-medium underline">Back</button><button type="button" disabled={cooldown > 0 || busy} onClick={() => void resend()} className="font-medium underline disabled:text-slate-400">{cooldown > 0 ? `Resend in ${cooldown}s` : "Resend OTP"}</button></div></> : null}
    {step === "password" ? <div className="space-y-4"><TextField name="password" label="New password" type="password" autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} hint="Use at least 8 characters." /><TextField name="confirmPassword" label="Confirm new password" type="password" autoComplete="new-password" required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></div> : null}
    <Button type="submit" size="lg" fullWidth disabled={busy}>{busy ? <><Spinner label="Working" /> Please wait…</> : step === "email" ? "Send verification code" : step === "otp" ? "Verify code" : "Set new password"}</Button>
    <p className="text-center text-sm"><Link href="/account/login" className="font-semibold underline">Back to sign in</Link></p>
  </form>;
}
