"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { postJson } from "@/components/pos/api";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { TextField } from "@/components/ui/TextField";
import { AlertIcon, CheckIcon } from "@/components/ui/icons";
import { STAFF_ROLE_LABELS, type StaffRole } from "@/lib/constants/staff";

interface AddStaffResponse {
  staff: {
    id: string;
    name: string;
    email: string;
    role: StaffRole;
  };
}

type AddableRole = "MANAGER" | "SELLER";

/**
 * Creates a staff account directly: the admin sets the email and an initial
 * password and shares the credentials with the new team member. No invitation
 * code is generated or stored.
 */
export function AddStaffForm({ canAddManager }: { canAddManager: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<AddableRole>("SELLER");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<AddStaffResponse["staff"] | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function resetForm() {
    setName("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setRole("SELLER");
    setFieldErrors({});
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setFieldErrors({});
    setFormError(null);
    setIsSubmitting(true);

    const result = await postJson<AddStaffResponse>("/api/staff/team", {
      name,
      email,
      password,
      confirmPassword,
      role,
    });

    if (result.ok) {
      setCreated(result.data.staff);
      resetForm();
      setIsSubmitting(false);
      router.refresh();
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
              {created.name} was added as {STAFF_ROLE_LABELS[created.role]}.
            </p>
            <p className="mt-1">
              They can sign in at <span className="font-semibold">/pos/login</span> with{" "}
              <span className="font-semibold">{created.email}</span> and the password
              you set.
            </p>
          </div>
        </div>

        <Button variant="ghost" size="sm" onClick={() => setCreated(null)}>
          Add another teammate
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
        name="name"
        label="Full name"
        autoComplete="off"
        required
        value={name}
        error={fieldErrors.name}
        onChange={(event) => setName(event.target.value)}
      />

      <TextField
        name="email"
        label="Work email"
        type="email"
        autoComplete="off"
        required
        value={email}
        error={fieldErrors.email}
        onChange={(event) => setEmail(event.target.value)}
      />

      <TextField
        name="password"
        label="Initial password"
        type="password"
        autoComplete="new-password"
        required
        value={password}
        error={fieldErrors.password}
        onChange={(event) => setPassword(event.target.value)}
        hint="At least 8 characters. Share it with your teammate."
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

      <div className="flex flex-col gap-1.5">
        <label htmlFor="addRole" className="text-sm font-medium text-slate-800">
          Role
        </label>
        <select
          id="addRole"
          value={role}
          onChange={(event) => setRole(event.target.value as AddableRole)}
          className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
        >
          <option value="SELLER">Seller / Biller</option>
          {canAddManager ? <option value="MANAGER">Manager</option> : null}
        </select>
        {!canAddManager ? (
          <p className="text-xs text-slate-500">
            Only Administrators can add Managers.
          </p>
        ) : null}
      </div>

      <Button type="submit" fullWidth disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Spinner label="Adding the team member" /> Adding...
          </>
        ) : (
          "Add team member"
        )}
      </Button>
    </form>
  );
}
