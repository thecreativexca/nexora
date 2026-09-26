import { z } from "zod";

import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
} from "@/lib/constants/customer";
import {
  INVITEABLE_STAFF_ROLES,
  STAFF_ROLE,
} from "@/lib/constants/staff";
import {
  customerNameSchema,
  emailSchema,
  objectIdSchema,
} from "@/lib/validations/common";

/**
 * Staff portal contracts (Phase 3). Shared by the client forms (instant
 * feedback) and the mandatory server-side validation in the route handlers.
 * Roles submitted from the browser are never trusted wholesale - the role in
 * an invite only exists to be cross-checked against the actor's own role.
 */

/** Min 8 chars, max 72 (bcrypt input limit). Server enforced. */
export const staffPasswordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
  .max(MAX_PASSWORD_LENGTH, `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`);

export const staffNameSchema = customerNameSchema;

export const staffLoginSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(1, "Enter your password.")
    .max(MAX_PASSWORD_LENGTH, "Password is too long."),
});
export type StaffLoginInput = z.input<typeof staffLoginSchema>;

const invitationCodeSchema = z
  .string()
  .trim()
  .min(8, "Enter the full invitation code.")
  .max(32, "That invitation code looks too long.");

/** Only MANAGER and CASHIER can ever be invited (never SUPER_ADMIN). */
export const staffInvitationSchema = z.object({
  email: emailSchema,
  role: z.enum(INVITEABLE_STAFF_ROLES, "Choose a valid staff role."),
});
export type StaffInvitationInput = z.input<typeof staffInvitationSchema>;

export const invitationCheckSchema = z.object({
  code: invitationCodeSchema,
  email: emailSchema,
});
export type InvitationCheckInput = z.input<typeof invitationCheckSchema>;

export const invitationAcceptSchema = z
  .object({
    code: invitationCodeSchema,
    email: emailSchema,
    name: staffNameSchema,
    password: staffPasswordSchema,
    confirmPassword: z.string().min(1, "Confirm your password."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });
export type InvitationAcceptInput = z.input<typeof invitationAcceptSchema>;

export const mfaVerifySchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app."),
});
export type MfaVerifyInput = z.input<typeof mfaVerifySchema>;

/**
 * Team management action. At least one of `isActive` / `role` must be present.
 * The `role` here is the *new target role* (MANAGER or CASHIER only).
 */
export const staffTeamActionSchema = z
  .object({
    staffId: objectIdSchema,
    isActive: z.boolean().optional(),
    role: z.enum([STAFF_ROLE.MANAGER, STAFF_ROLE.CASHIER]).optional(),
  })
  .refine((data) => data.isActive !== undefined || data.role !== undefined, {
    message: "Provide an action (activate/deactivate or role change).",
  });
export type StaffTeamActionInput = z.input<typeof staffTeamActionSchema>;

export const staffFieldSchemas = {
  email: emailSchema,
  name: staffNameSchema,
  password: staffPasswordSchema,
  invitationCode: invitationCodeSchema,
  mfaCode: mfaVerifySchema.shape.code,
} as const;

export type StaffFieldName = keyof typeof staffFieldSchemas;