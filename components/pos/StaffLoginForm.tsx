"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { postJson } from "@/components/pos/api";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { TextField } from "@/components/ui/TextField";
import { AlertIcon } from "@/components/ui/icons";

interface LoginResponse {
  step: "COMPLETE" | "MFA_VERIFY";
  redirectTo: string;
}

/** Staff sign-in form. After success it hands over to the redirect URL. */
export function StaffLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setFieldErrors({});
    setFormError(null);
    setIsSubmitting(true);

    const result = await postJson<LoginResponse>("/api/staff/login", {
      email,
      password,
    });

    if (result.ok) {
      router.replace(result.data.redirectTo);
      return;
    }

    const mapped: Record<string, string> = {};
    for (const [field, messages] of Object.entries(result.fieldErrors)) {
      mapped[field] = messages[0] ?? "Invalid value.";
    }
    setFieldErrors(mapped);
    setFormError(result.message);
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

      <TextField
        name="email"
        label="Work email"
        type="email"
        autoComplete="email"
        required
        value={email}
        error={fieldErrors.email}
        onChange={(event) => setEmail(event.target.value)}
      />

      <TextField
        name="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        error={fieldErrors.password}
        onChange={(event) => setPassword(event.target.value)}
      />

      <Button type="submit" size="lg" fullWidth disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Spinner label="Signing you in" /> Signing in...
          </>
        ) : (
          "Sign in"
        )}
      </Button>

      <p className="text-center text-sm text-slate-600">
        Were you invited?{" "}
        <Link href="/pos/join" className="font-semibold text-slate-900 underline">
          Join with a code
        </Link>
      </p>
    </form>
  );
}