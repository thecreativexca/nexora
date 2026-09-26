"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { updateProfileAction } from "@/app/(storefront)/account/actions";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { TextField } from "@/components/ui/TextField";
import { CheckIcon } from "@/components/ui/icons";
import type { CustomerView } from "@/types/customer";

interface ProfileValues {
  name: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

function toInitialValues(customer: CustomerView): ProfileValues {
  return {
    name: customer.name,
    phone: customer.phone,
    line1: customer.address?.line1 ?? "",
    line2: customer.address?.line2 ?? "",
    city: customer.address?.city ?? "",
    state: customer.address?.state ?? "",
    postalCode: customer.address?.postalCode ?? "",
    country: customer.address?.country ?? "India",
  };
}

export function ProfileForm({ customer }: { customer: CustomerView }) {
  const router = useRouter();
  const [values, setValues] = useState<ProfileValues>(() => toInitialValues(customer));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (field: keyof ProfileValues, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setSaved(false);
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

    setFieldErrors({});
    setFormError(null);
    setSaved(false);
    setIsSubmitting(true);

    // A blank core address means "no saved address"; sending it clears the one
    // on file instead of tripping over the required address fields.
    const hasAddress = [values.line1, values.city, values.state, values.postalCode].some(
      (value) => value.trim() !== "",
    );

    try {
      const result = await updateProfileAction({
        name: values.name,
        phone: values.phone,
        address: hasAddress
          ? {
              line1: values.line1,
              line2: values.line2,
              city: values.city,
              state: values.state,
              postalCode: values.postalCode,
              country: values.country,
            }
          : undefined,
      });

      if (result.ok) {
        setValues(toInitialValues(result.customer));
        setSaved(true);
        router.refresh();
        return;
      }

      const mapped: Record<string, string> = {};
      for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
        const key = field.startsWith("address.") ? field.slice("address.".length) : field;
        mapped[key] = messages[0] ?? "Invalid value.";
      }
      setFieldErrors(mapped);
      setFormError(result.message);
    } catch {
      setFormError("We could not reach the server. Please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {formError ? (
        <div
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
        >
          {formError}
        </div>
      ) : null}

      {saved ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          <CheckIcon className="h-4 w-4 shrink-0" />
          <p>Your profile has been saved.</p>
        </div>
      ) : null}

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-slate-900">Contact details</legend>

        <TextField
          name="name"
          label="Full name"
          autoComplete="name"
          required
          value={values.name}
          error={fieldErrors.name}
          onChange={(event) => handleChange("name", event.target.value)}
        />

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-800">Email</span>
          <p className="flex h-11 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500">
            {customer.email}
          </p>
          <p className="text-xs text-slate-500">Your email is used to sign in and cannot be changed here.</p>
        </div>

        <TextField
          name="phone"
          label="Phone"
          type="tel"
          autoComplete="tel"
          optional
          value={values.phone}
          error={fieldErrors.phone}
          onChange={(event) => handleChange("phone", event.target.value)}
        />
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-slate-900">Default delivery address</legend>
        <p className="text-sm text-slate-600">
          Saved for faster checkout. Leave these blank to remove your saved address.
        </p>

        <TextField
          name="line1"
          label="Address line 1"
          autoComplete="address-line1"
          value={values.line1}
          error={fieldErrors.line1}
          onChange={(event) => handleChange("line1", event.target.value)}
        />
        <TextField
          name="line2"
          label="Address line 2"
          optional
          autoComplete="address-line2"
          value={values.line2}
          error={fieldErrors.line2}
          onChange={(event) => handleChange("line2", event.target.value)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="city"
            label="City"
            autoComplete="address-level2"
            value={values.city}
            error={fieldErrors.city}
            onChange={(event) => handleChange("city", event.target.value)}
          />
          <TextField
            name="state"
            label="State / Region"
            autoComplete="address-level1"
            value={values.state}
            error={fieldErrors.state}
            onChange={(event) => handleChange("state", event.target.value)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="postalCode"
            label="Postal code"
            autoComplete="postal-code"
            value={values.postalCode}
            error={fieldErrors.postalCode}
            onChange={(event) => handleChange("postalCode", event.target.value)}
          />
          <TextField
            name="country"
            label="Country"
            autoComplete="country-name"
            value={values.country}
            error={fieldErrors.country}
            onChange={(event) => handleChange("country", event.target.value)}
          />
        </div>
      </fieldset>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Spinner label="Saving your profile" /> Saving...
            </>
          ) : (
            "Save changes"
          )}
        </Button>
      </div>
    </form>
  );
}
