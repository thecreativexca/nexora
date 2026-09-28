import "server-only";

import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

import { AUDIT_ACTION } from "@/lib/constants/audit";
import { connectDB } from "@/lib/db/mongodb";
import { recordAudit } from "@/lib/services/audit.service";
import { toDatabaseError } from "@/lib/services/service-errors";
import { getStaffViewById } from "@/lib/services/staff.service";
import {
  InvalidRequestError,
  StaffManagementFailedError,
  TooManyRequestsError,
} from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";
import { StaffLoginOTP } from "@/models/StaffLoginOTP";
import { StaffProfile } from "@/models/StaffProfile";

/**
 * Email-OTP two-step sign-in for the staff portal.
 *
 * Every Manager / Super-Admin login sends a cryptographically random 6-digit
 * code to the staff member's email via Resend. Only an HMAC of the code is
 * stored; codes expire after 10 minutes, allow five attempts, have a
 * 60-second resend cooldown and are invalidated on resend. Entering the right
 * code completes sign-in - there is no authenticator-app enrolment.
 */

const OTP_TTL_MS = 10 * 60 * 1000;
const COOLDOWN_MS = 60_000;
const MAX_ATTEMPTS = 5;
const MAX_REQUESTS_PER_HOUR = 5;

function secret(): string {
  const value = process.env.STAFF_SESSION_SECRET?.trim();
  if (!value) {
    throw new Error("STAFF_SESSION_SECRET is not set.");
  }
  return value;
}

function hashOtp(staffId: string, otp: string): string {
  return createHmac("sha256", secret()).update(`${staffId}:${otp}`).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function sendOtpEmail(email: string, name: string, otp: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !from) {
    throw new Error("Resend is not configured (RESEND_API_KEY / RESEND_FROM_EMAIL).");
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Nexora POS sign-in code",
      html: `<div style="font-family:Arial,sans-serif;max-width:560px"><h1 style="font-size:22px">Sign in to Nexora POS</h1><p>Hi ${name},</p><p>Use this one-time code to finish signing in:</p><p style="font-size:32px;font-weight:700;letter-spacing:8px">${otp}</p><p>This code expires in 10 minutes and can be used once. Never share it with anyone.</p><p>If you did not try to sign in, you can ignore this email.</p></div>`,
    }),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Resend rejected the email (${response.status}).`);
  }
}

/**
 * Issues a fresh email OTP for the staff member. Throws TooManyRequestsError
 * while the resend cooldown or the hourly cap is active.
 */
export async function requestStaffLoginOtp(staffId: string): Promise<{
  cooldownSeconds: number;
  expiresInMinutes: number;
}> {
  try {
    await connectDB();
  } catch (error) {
    throw toDatabaseError(error);
  }

  const staff = await getStaffViewById(staffId);
  if (!staff) throw new StaffManagementFailedError();

  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const latest = await StaffLoginOTP.findOne({ staffId }).sort({ createdAt: -1 }).lean<{
    createdAt: Date;
  } | null>();

  if (latest && now.getTime() - new Date(latest.createdAt).getTime() < COOLDOWN_MS) {
    const retryAfterSeconds = Math.ceil(
      (COOLDOWN_MS - (now.getTime() - new Date(latest.createdAt).getTime())) / 1000,
    );
    throw new TooManyRequestsError(undefined, retryAfterSeconds);
  }
  const hourlyCount = await StaffLoginOTP.countDocuments({
    staffId,
    createdAt: { $gte: hourAgo },
  });
  if (hourlyCount >= MAX_REQUESTS_PER_HOUR) {
    throw new TooManyRequestsError("Too many codes requested. Please try again later.", 3600);
  }

  const otp = String(randomInt(100000, 1_000_000));

  // Resend invalidates every previous outstanding code for this staff member.
  await StaffLoginOTP.updateMany({ staffId, usedAt: null }, { $set: { usedAt: now } });
  await StaffLoginOTP.create({
    staffId,
    email: staff.email.toLowerCase(),
    otpHash: hashOtp(staffId, otp),
    attempts: 0,
    expiresAt: new Date(now.getTime() + OTP_TTL_MS),
  });

  try {
    await sendOtpEmail(staff.email, staff.name, otp);
  } catch (error) {
    logger.error("Staff sign-in OTP email delivery failed", error, { staffId });
    throw new StaffManagementFailedError(
      "We could not email your sign-in code. Please try again.",
      error,
    );
  }

  return { cooldownSeconds: 60, expiresInMinutes: 10 };
}

/**
 * Checks an email OTP for the pending staff member. Only used after the
 * HMAC-signed pre-auth cookie proved the password step succeeded.
 */
export async function verifyStaffLoginOtp(staffId: string, code: string): Promise<void> {
  try {
    await connectDB();
  } catch (error) {
    throw toDatabaseError(error);
  }

  const record = await StaffLoginOTP.findOne({ staffId, usedAt: null }).sort({ createdAt: -1 });
  if (!record || record.expiresAt <= new Date()) {
    throw new InvalidRequestError("That code is invalid or expired. Request a new one.");
  }

  if (!safeEqual(record.otpHash, hashOtp(staffId, code))) {
    record.attempts += 1;
    const exhausted = record.attempts >= MAX_ATTEMPTS;
    if (exhausted) record.usedAt = new Date();
    await record.save();
    if (exhausted) {
      await recordAudit({
        actorStaffId: staffId,
        action: AUDIT_ACTION.STAFF_MFA_FAILED,
        targetStaffId: staffId,
      });
      throw new InvalidRequestError("Too many incorrect attempts. Request a new code.");
    }
    throw new InvalidRequestError("That code is invalid or expired.");
  }

  record.usedAt = new Date();
  await record.save();

  // Successful two-step sign-in also clears any login lockout state.
  await StaffProfile.findByIdAndUpdate(staffId, {
    $set: { failedLoginCount: 0, lockedUntil: null },
  });

  await recordAudit({
    actorStaffId: staffId,
    action: AUDIT_ACTION.STAFF_MFA_VERIFIED,
    targetStaffId: staffId,
  });
}