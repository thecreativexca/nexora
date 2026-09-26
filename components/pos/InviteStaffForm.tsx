"use client";

import { useState, type FormEvent } from "react";

import { postJson } from "@/components/pos/api";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { TextField } from "@/components/ui/TextField";
import { AlertIcon, CheckIcon } from "@/components/ui/icons";

interface InviteResponse {
  code: string;
  invitation: {
    email: string;
    role: string;
    expiresAt: string;
  };
}

/**
 * Invite-staff form. The one-time code is shown exactly once, after creation;
 * it is not stored anywhere and can never be retrieved again.
 */
export function InviteStaffForm({ canInviteManager }: { canInviteManager: boolean }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"MANAGER" | "CASHIER">("CASHIER");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<InviteResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setFieldErrors({});
    setFormError(null);
    setCopied(false);
    setIsSubmitting(true);

    const result = await postJson<InviteResponse>("/api/staff/invitations", {
      email,
      role,
    });

    if (result.ok) {
      setCreated(result.data);
      setEmail("");
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

  if (created) {
    return (
      <div className="space-y-4">
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">
              Invitation created for {created.invitation.email}
            </p>
            <p className="mt-1">
              Share this one-time code with them. It expires{" "}
              {new Date(created.invitation.expiresAt).toLocaleString()} and can be used once.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-slate-300 bg-slate-50 p-3">
          <p className="font-mono text-base tracking-widest text-slate-900">{created.code}</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-2"
            onClick={() => {
              void navigator.clipboard?.writeText(created.code);
              setCopied(true);
            }}
          >
            {copied ? "Copied" : "Copy code"}
          </Button>
        </div>

        <Button variant="ghost" size="sm" onClick={() => setCreated(null)}>
          Invite another
        </Button>
      </div>
    );
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
        name="inviteEmail"
        label="Email to invite"
        type="email"
        autoComplete="off"
        required
        value={email}
        error={fieldErrors.email}
        onChange={(event) => setEmail(event.target.value)}
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="inviteRole" className="text-sm font-medium text-slate-800">
          Role
        </label>
        <select
          id="inviteRole"
          value={role}
          onChange={(event) => setRole(event.target.value as "MANAGER" | "CASHIER")}
          className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
        >
          <option value="CASHIER">Cashier</option>
          {canInviteManager ? <option value="MANAGER">Manager</option> : null}
        </select>
        {!canInviteManager ? (
          <p className="text-xs text-slate-500">
            Only Super-Admins can invite Managers.
          </p>
        ) : null}
      </div>

      <Button type="submit" fullWidth disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Spinner label="Creating the invitation" /> Creating...
          </>
        ) : (
          "Create invitation"
        )}
      </Button>
    </form>
  );
}