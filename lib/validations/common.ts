import { z } from "zod";

import { MAX_LINE_QUANTITY } from "@/lib/constants/catalog";

/**
 * Field-level schemas shared by the (optional) client-side UX checks and the
 * mandatory server-side validation. Zod only - no Mongoose imports here, so
 * this module stays usable from Client Components.
 */

export const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;
export const PHONE_PATTERN = /^\+?[0-9][0-9\s\-()]{7,19}$/;
export const POSTAL_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9\s-]{2,11}$/;

export const objectIdSchema = z
  .string()
  .trim()
  .regex(OBJECT_ID_PATTERN, "Invalid identifier.");

export const quantitySchema = z
  .number()
  .int("Quantity must be a whole number.")
  .min(1, "Quantity must be at least 1.")
  .max(MAX_LINE_QUANTITY, `Quantity cannot be more than ${MAX_LINE_QUANTITY}.`);

export const customerNameSchema = z
  .string()
  .trim()
  .min(2, "Please enter the full name.")
  .max(120, "Name is too long.");

export const emailSchema = z
  .string()
  .trim()
  .min(6, "Enter a valid email address.")
  .max(254, "Email address is too long.")
  .regex(EMAIL_PATTERN, "Enter a valid email address.");

export const phoneSchema = z
  .string()
  .trim()
  .regex(PHONE_PATTERN, "Enter a valid phone number (8-20 digits, may start with +).");

export const postalCodeSchema = z
  .string()
  .trim()
  .regex(POSTAL_CODE_PATTERN, "Enter a valid postal code.");

export function requiredTextSchema(label: string, maxLength = 80) {
  return z
    .string()
    .trim()
    .min(2, `${label} is required.`)
    .max(maxLength, `${label} is too long.`);
}

export function optionalTextSchema(maxLength: number) {
  return z.string().trim().max(maxLength, "This value is too long.");
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** Keeps the leading "+" (when present) and strips formatting characters. */
export function normalizePhone(value: string): string {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

export const deliveryAddressSchema = z.object({
  line1: requiredTextSchema("Address line 1", 160),
  line2: optionalTextSchema(160),
  city: requiredTextSchema("City", 80),
  state: requiredTextSchema("State / Region", 80),
  postalCode: postalCodeSchema,
  country: requiredTextSchema("Country", 60),
});

export type DeliveryAddressInput = z.infer<typeof deliveryAddressSchema>;

/** Field-level schemas reused by the checkout form for instant feedback. */
export const checkoutFieldSchemas = {
  customerName: customerNameSchema,
  customerEmail: emailSchema,
  customerPhone: phoneSchema,
  addressLine1: requiredTextSchema("Address line 1", 160),
  addressLine2: optionalTextSchema(160),
  city: requiredTextSchema("City", 80),
  state: requiredTextSchema("State / Region", 80),
  postalCode: postalCodeSchema,
  country: requiredTextSchema("Country", 60),
} as const;

export type CheckoutFieldName = keyof typeof checkoutFieldSchemas;
