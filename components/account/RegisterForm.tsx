"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { registerAction } from "@/app/(storefront)/account/actions";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { TextField } from "@/components/ui/TextField";
import { AlertIcon } from "@/components/ui/icons";
import { customerFieldSchemas } from "@/lib/validations/customer";
import { SocialLoginButtons } from "@/components/account/SocialLoginButtons";

interface RegisterValues {
  name: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
}

const INITIAL_VALUES: RegisterValues = {
  name: "",
  email: "",
  phone: "",
  password: "",
  confirmPassword: "",
};

/** Keys of `RegisterValues` that map to a reusable Zod field schema. */
const FIELD_SCHEMAS = {
  name: customerFieldSchemas.name,
  email: customerFieldSchemas.email,
  phone: customerFieldSchemas.phone,
  password: customerFieldSchemas.password,
} as const;

type ValidatableField = keyof typeof FIELD_SCHEMAS;

function validate(values: RegisterValues): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const field of Object.keys(FIELD_SCHEMAS) as ValidatableField[]) {
    const result = FIELD_SCHEMAS[field].safeParse(values[field]);
    if (!result.success) {
      errors[field] = result.error.issues[0]?.message ?? "Invalid value.";
    }
  }

  if (values.confirmPassword !== values.password) {
    errors.confirmPassword = "Passwords do not match.";
  }

  return errors;
}

export function RegisterForm({ next }: { next: string }) {
  const router = useRouter();
  const [values, setValues] = useState<RegisterValues>(INITIAL_VALUES);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (field: keyof RegisterValues, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const nextErrors = { ...current };
      delete nextErrors[field];
      return nextErrors;
    });
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const clientErrors = validate(values);
    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors);
      setFormError("Please correct the highlighted fields before continuing.");
      return;
    }

    setFieldErrors({});
    setFormError(null);
    setIsSubmitting(true);

    try {
      const result = await registerAction({ ...values, next });

      if (result.ok) {
        router.replace(result.redirectTo);
        router.refresh();
        return;
      }

      const mapped: Record<string, string> = {};
      for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
        mapped[field] = messages[0] ?? "Invalid value.";
      }
      setFieldErrors(mapped);
      setFormError(result.message);
    } catch {
      setFormError("We could not reach the server. Please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const loginHref = next ? `/account/login?next=${encodeURIComponent(next)}` : "/account/login";

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <SocialLoginButtons next={next} />
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
        value={values.name}
        error={fieldErrors.name}
        onChange={(event) => handleChange("name", event.target.value)}
      />

      <TextField
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        value={values.email}
        error={fieldErrors.email}
        onChange={(event) => handleChange("email", event.target.value)}
      />

      <TextField
        name="phone"
        label="Phone"
        type="tel"
        autoComplete="tel"
        optional
        value={values.phone}
        error={fieldErrors.phone}
        hint="Speeds up checkout and lets us call about deliveries."
        onChange={(event) => handleChange("phone", event.target.value)}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          value={values.password}
          error={fieldErrors.password}
          hint="At least 8 characters."
          onChange={(event) => handleChange("password", event.target.value)}
        />
        <TextField
          name="confirmPassword"
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          required
          value={values.confirmPassword}
          error={fieldErrors.confirmPassword}
          onChange={(event) => handleChange("confirmPassword", event.target.value)}
        />
      </div>

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
        Already have an account?{" "}
        <Link href={loginHref} className="font-semibold text-slate-900 underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
