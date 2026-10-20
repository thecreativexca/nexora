"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

import {
  createCustomerSession,
  destroyCustomerSession,
  getCurrentCustomer,
} from "@/lib/auth/customer-session";
import { createStaffEntry } from "@/lib/auth/staff-entry";
import {
  authenticateCustomer,
  registerCustomer,
  updateCustomerProfile,
} from "@/lib/services/customer.service";
import { authenticateStaff } from "@/lib/services/staff.service";
import { isAppError, toFieldErrors } from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";
import { staffLoginLimiter } from "@/lib/security/rate-limit";
import {
  customerLoginSchema,
  customerProfileSchema,
  customerRegistrationSchema,
} from "@/lib/validations/customer";
import type { CustomerView } from "@/types/customer";

export type AuthActionResult =
  | { ok: true; redirectTo: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string[]> };

export type ProfileActionResult =
  | { ok: true; customer: CustomerView }
  | { ok: false; message: string; fieldErrors?: Record<string, string[]> };

/** Only relative in-app paths are accepted, preventing open-redirect abuse. */
function safeNextPath(next: unknown): string {
  if (typeof next !== "string") return "/account";
  if (!next.startsWith("/") || next.startsWith("//")) return "/account";
  return next;
}

export async function registerAction(input: unknown): Promise<AuthActionResult> {
  const parsed = customerRegistrationSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      message: "Please check the highlighted fields and try again.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  try {
    const customer = await registerCustomer({
      name: parsed.data.name,
      email: parsed.data.email,
      password: parsed.data.password,
      phone: parsed.data.phone,
    });

    // Auto sign-in after registration keeps the flow to a single step.
    await createCustomerSession(customer.id);
    revalidatePath("/account");
    const requestedNext = (input as { next?: unknown } | null)?.next;
    return { ok: true, redirectTo: safeNextPath(requestedNext) };
  } catch (error) {
    if (isAppError(error)) {
      if (error.status >= 500) logger.error("Registration failed", error);
      return { ok: false, message: error.message, fieldErrors: error.fieldErrors };
    }
    logger.error("Registration failed with an unexpected error", error);
    return {
      ok: false,
      message: "We could not create your account. Please try again in a moment.",
    };
  }
}

export async function loginAction(input: unknown): Promise<AuthActionResult> {
  const parsed = customerLoginSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      message: "Please enter a valid email and password.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  const requestedNext = (input as { next?: unknown } | null)?.next;

  try {
    const customer = await authenticateCustomer(parsed.data.email, parsed.data.password);
    await createCustomerSession(customer.id);
    revalidatePath("/account");
    return { ok: true, redirectTo: safeNextPath(requestedNext) };
  } catch (error) {
    // Only an invalid customer credential falls through to staff auth. Database
    // and disabled-account errors remain authoritative and are never masked.
    if (!isAppError(error) || error.code !== "INVALID_CREDENTIALS") {
      if (isAppError(error) && error.status >= 500) logger.error("Sign-in failed", error);
      return {
        ok: false,
        message: isAppError(error) ? error.message : "We could not sign you in. Please try again in a moment.",
        fieldErrors: isAppError(error) ? error.fieldErrors : undefined,
      };
    }
  }

  try {
    const requestHeaders = await headers();
    const forwarded = requestHeaders.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || "local";
    const decision = staffLoginLimiter.check(`${ip}:login:${parsed.data.email.toLowerCase()}`);
    if (!decision.allowed) {
      return { ok: false, message: `Too many sign-in attempts. Try again in ${decision.retryAfterSeconds} seconds.` };
    }

    const staff = await authenticateStaff(parsed.data.email, parsed.data.password);
    const entry = await createStaffEntry(staff);
    revalidatePath("/pos", "layout");
    return { ok: true, redirectTo: entry.redirectTo };
  } catch (error) {
    if (isAppError(error)) {
      if (error.status >= 500) logger.error("Staff sign-in failed", error);
      return { ok: false, message: error.message, fieldErrors: error.fieldErrors };
    }
    logger.error("Unified sign-in failed with an unexpected error", error);
    return { ok: false, message: "We could not sign you in. Please try again in a moment." };
  }
}

/** Used directly as a `<form action>`; always ends on the storefront home. */
export async function logoutAction(): Promise<void> {
  await destroyCustomerSession();
  revalidatePath("/", "layout");
  redirect("/");
}

export async function updateProfileAction(input: unknown): Promise<ProfileActionResult> {
  const customer = await getCurrentCustomer();
  if (!customer) {
    return { ok: false, message: "Your session has expired. Please sign in again." };
  }

  const parsed = customerProfileSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Please check the highlighted fields and try again.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  try {
    const updated = await updateCustomerProfile(customer.id, {
      name: parsed.data.name,
      phone: parsed.data.phone,
      address: parsed.data.address,
    });
    revalidatePath("/account");
    revalidatePath("/account/profile");
    return { ok: true, customer: updated };
  } catch (error) {
    if (isAppError(error)) {
      if (error.status >= 500) logger.error("Profile update failed", error);
      return { ok: false, message: error.message, fieldErrors: error.fieldErrors };
    }
    logger.error("Profile update failed with an unexpected error", error);
    return {
      ok: false,
      message: "We could not save your changes. Please try again in a moment.",
    };
  }
}
