import { z } from "zod";

import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
} from "@/lib/constants/customer";
import {
  PHONE_PATTERN,
  customerNameSchema,
  deliveryAddressSchema,
  emailSchema,
  objectIdSchema,
} from "@/lib/validations/common";

/**
 * Customer-account contracts. Shared by the client forms (instant feedback) and
 * the mandatory server-side validation in the server actions and API routes.
 */

const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
  .max(MAX_PASSWORD_LENGTH, `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`);

/** Empty string means "not provided"; anything else must look like a phone. */
export const optionalPhoneSchema = z
  .string()
  .trim()
  .max(24, "Phone number is too long.")
  .refine((value) => value === "" || PHONE_PATTERN.test(value), {
    message: "Enter a valid phone number (8-20 digits, may start with +).",
  })
  .optional()
  .default("");

function isBlankAddress(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return true;
  const candidate = value as Record<string, unknown>;
  return ["line1", "city", "state", "postalCode", "country"].every(
    (field) => String(candidate[field] ?? "").trim() === "",
  );
}

/** A fully blank address is treated as "no saved address", not a validation error. */
export const optionalAddressSchema = z.preprocess(
  (value) => (isBlankAddress(value) ? undefined : value),
  deliveryAddressSchema.optional(),
);

export const customerRegistrationSchema = z
  .object({
    name: customerNameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Confirm your password."),
    phone: optionalPhoneSchema,
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type CustomerRegistrationInput = z.input<typeof customerRegistrationSchema>;

export const customerLoginSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(1, "Enter your password.")
    .max(MAX_PASSWORD_LENGTH, "Password is too long."),
});

export type CustomerLoginInput = z.input<typeof customerLoginSchema>;

export const customerProfileSchema = z.object({
  name: customerNameSchema,
  phone: optionalPhoneSchema,
  address: optionalAddressSchema,
});

export type CustomerProfileInput = z.input<typeof customerProfileSchema>;

export const customerPasswordSchema = passwordSchema;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export const verifyResetOtpSchema = z.object({
  email: emailSchema,
  otp: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code."),
});
export const resetPasswordSchema = z.object({
  resetToken: z.string().min(32).max(256),
  password: passwordSchema,
  confirmPassword: z.string(),
}).refine((value) => value.password === value.confirmPassword, {
  path: ["confirmPassword"], message: "Passwords do not match.",
});

/** Staff action for enabling or disabling a storefront customer account. */
export const customerAdminActionSchema = z.object({
  customerId: objectIdSchema,
  isActive: z.boolean(),
});

/** Field-level schemas reused by the account forms for instant feedback. */
export const customerFieldSchemas = {
  name: customerNameSchema,
  email: emailSchema,
  password: passwordSchema,
  phone: optionalPhoneSchema,
} as const;

export type CustomerFieldName = keyof typeof customerFieldSchemas;
