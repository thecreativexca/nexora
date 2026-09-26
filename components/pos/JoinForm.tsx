"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { postJson } from "@/components/pos/api";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { TextField } from "@/components/ui/TextField";
import { AlertIcon, CheckIcon } from "@/components/ui/icons";

interface CheckResponse {
  invitation: { email: string; role: string; expiresAt: string };
}
interface AcceptResponse {
  step: "COMPLETE" | "MFA_SETUP" | "MFA_VERIFY";
  redirectTo: string;
}

const ROLE_BY_CODE: Record<string, string> = {
  MANAGER: "Manager",
  CASHIER: "Cashier",
};

/** Two-step join flow: validate the invitation code, then create the account. */
export function JoinForm() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [invitedRole, setInvitedRole] = useState<string>("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function checkCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setFieldErrors({});
    setFormError(null);
    setIsSubmitting(true);

    const result = await postJson<CheckResponse>("/api/staff/invitations/check", {
      code,
      email,
    });

    if (result.ok) {
      setInvitedRole(ROLE_BY_CODE[result.data.invitation.role] ?? result.data.invitation.role);
      setStep(2);
      setIsSubmitting(false);
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

  async function acceptInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setFieldErrors({});
    setFormError(null);
    setIsSubmitting(true);

    const result = await postJson<AcceptResponse>("/api/staff/invitations/accept", {
      code,
      email,
      name,
      password,
      confirmPassword,
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

  if (step === 1) {
    return (
      <form onSubmit={checkCode} noValidate className="space-y-4">
        <p className="text-sm text-slate-600">
          Paste the invitation code your manager shared with you, along with the email
          address the invitation was issued to.
        </p>

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
          name="code"
          label="Invitation code"
          autoComplete="off"
          required
          value={code}
          error={fieldErrors.code}
          onChange={(event) => setCode(event.target.value)}
          hint="Check with the person who invited you if you do not have it."
        />

        <TextField
          name="email"
          label="Invited email"
          type="email"
          autoComplete="email"
          required
          value={email}
          error={fieldErrors.email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <Button type="submit" size="lg" fullWidth disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Spinner label="Checking the invitation" /> Checking...
            </>
          ) : (
            "Continue"
          )}
        </Button>

        <p className="text-center text-sm text-slate-600">
          Already on the team?{" "}
          <Link href="/pos/login" className="font-semibold text-slate-900 underline">
            Sign in
          </Link>
        </p>
      </form>
    );
  }

  return (
    <form onSubmit={acceptInvite} noValidate className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
        <CheckIcon className="h-4 w-4 shrink-0" />
        <p>
          Invitation accepted for <span className="font-semibold">{email}</span> as{" "}
          <span className="font-semibold">{invitedRole}</span>.
        </p>
      </div>

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
        name="name"
        label="Full name"
        autoComplete="name"
        required
        value={name}
        error={fieldErrors.name}
        onChange={(event) => setName(event.target.value)}
      />

      <TextField
        name="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        required
        value={password}
        error={fieldErrors.password}
        onChange={(event) => setPassword(event.target.value)}
        hint="At least 8 characters. This is how you sign in to the store portal."
      />

      <TextField
        name="confirmPassword"
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        required
        value={confirmPassword}
        error={fieldErrors.confirmPassword}
        onChange={(event) => setConfirmPassword(event.target.value)}
      />

      <Button type="submit" size="lg" fullWidth disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Spinner label="Creating your account" /> Creating account...
          </>
        ) : (
          "Create account"
        )}
      </Button>

      <p className="text-center text-sm text-slate-600">
        <button
          type="button"
          onClick={() => {
            setStep(1);
            setFormError(null);
          }}
          className="font-semibold text-slate-900 underline"
        >
          Use a different code
        </button>
      </p>
    </form>
  );
}