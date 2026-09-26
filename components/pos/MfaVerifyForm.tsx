"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { postJson } from "@/components/pos/api";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { TextField } from "@/components/ui/TextField";
import { AlertIcon } from "@/components/ui/icons";

interface VerifyResponse {
  ok: boolean;
  redirectTo: string;
}

/** Two-step sign-in: enter the current code from your authenticator app. */
export function MfaVerifyForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
        Open your authenticator app and enter the 6-digit code for{" "}
        <span className="font-semibold">Nexora POS</span>.
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
    </form>
  );
}