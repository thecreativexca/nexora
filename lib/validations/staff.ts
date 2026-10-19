import { z } from "zod";

import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
} from "@/lib/constants/customer";
import {
  ADDABLE_STAFF_ROLES,
  ALL_STAFF_PERMISSIONS,
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
 * a creation request only exists to be cross-checked against the actor's role.
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

/**
 * Direct team-member creation. An admin sets the initial password and shares
 * it with the new joiner - there is no invitation code.
 */
export const staffCreateMemberSchema = z
  .object({
    name: staffNameSchema,
    email: emailSchema,
    password: staffPasswordSchema,
    confirmPassword: z.string().min(1, "Confirm the password."),
    role: z.enum(ADDABLE_STAFF_ROLES, "Choose a valid staff role."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });
export type StaffCreateMemberInput = z.input<typeof staffCreateMemberSchema>;

/**
 * Team management action. At least one of `isActive` / `role` / `permissions` must be present.
 * The `role` here is the *new target role* (MANAGER, SELLER or CASHIER).
 */
export const staffTeamActionSchema = z
  .object({
    staffId: objectIdSchema,
    isActive: z.boolean().optional(),
    role: z.enum([STAFF_ROLE.MANAGER, STAFF_ROLE.SELLER, STAFF_ROLE.CASHIER]).optional(),
    permissionGrants: z.array(z.string()).optional(),
    permissionDenies: z.array(z.string()).optional(),
  })
  .refine(
    (data) =>
      data.isActive !== undefined ||
      data.role !== undefined ||
      data.permissionGrants !== undefined ||
      data.permissionDenies !== undefined,
    {
      message: "Provide an action (activate/deactivate, role change, or permissions update).",
    },
  );
export type StaffTeamActionInput = z.input<typeof staffTeamActionSchema>;

const staffPermissionSchema = z.string().refine(
  (value): value is (typeof ALL_STAFF_PERMISSIONS)[number] =>
    (ALL_STAFF_PERMISSIONS as readonly string[]).includes(value),
  "Choose a valid staff permission.",
);

export const staffPermissionsUpdateSchema = z.object({
  permissionGrants: z.array(staffPermissionSchema).max(ALL_STAFF_PERMISSIONS.length).default([]),
  permissionDenies: z.array(staffPermissionSchema).max(ALL_STAFF_PERMISSIONS.length).default([]),
});
export type StaffPermissionsUpdateInput = z.input<typeof staffPermissionsUpdateSchema>;

export const staffFieldSchemas = {
  email: emailSchema,
  name: staffNameSchema,
  password: staffPasswordSchema,
} as const;

export type StaffFieldName = keyof typeof staffFieldSchemas;
