"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { postJson } from "@/components/pos/api";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { TextField } from "@/components/ui/TextField";
import { AlertIcon } from "@/components/ui/icons";

interface VerifyResponse {
  ok: boolean;
  redirectTo: string;
}

interface ResendResponse {
  cooldownSeconds: number;
}

/** Two-step sign-in: enter the code we emailed to you. */
export function MfaVerifyForm({ email }: { email: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(
      () => setCooldown((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function handleResend() {
    if (cooldown > 0 || isSubmitting) return;
    setFormError(null);
    setInfo(null);
    setIsSubmitting(true);
    const result = await postJson<ResendResponse>("/api/staff/mfa/resend", {});
    setIsSubmitting(false);
    if (result.ok) {
      setCooldown(result.data.cooldownSeconds ?? 60);
      setCode("");
      setInfo("A new code has been sent to your email.");
    } else {
      setFormError(result.message);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setFormError(null);
    setIsSubmitting(true);

    const result = await postJson<VerifyResponse>("/api/staff/mfa/verify", { code });

    if (result.ok) {
      router.replace(result.data.redirectTo);
      return;
    }

    setFormError(result.message);
    setCode("");
    setIsSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {info ? (
        <div
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"
        >
          {info}
        </div>
      ) : null}
      {formError ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
        >
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{formError}</p>
        </div>
      ) : null}

      <p className="text-sm text-slate-600">
        We emailed a 6-digit sign-in code to{" "}
        <span className="font-semibold">{email}</span>. Enter it below to
        continue. The code expires in 10 minutes.
      </p>

      <TextField
        name="code"
        label="6-digit code"
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        maxLength={6}
        required
        value={code}
        error={null}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
      />

      <Button type="submit" size="lg" fullWidth disabled={isSubmitting || code.length !== 6}>
        {isSubmitting ? (
          <>
            <Spinner label="Verifying" /> Verifying...
          </>
        ) : (
          "Verify & continue"
        )}
      </Button>

      <div className="text-center text-sm">
        <button
          type="button"
          disabled={cooldown > 0 || isSubmitting}
          onClick={() => void handleResend()}
          className="font-medium text-slate-700 underline disabled:text-slate-400"
        >
          {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
        </button>
      </div>
    </form>
  );
}