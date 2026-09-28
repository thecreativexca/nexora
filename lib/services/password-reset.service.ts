import "server-only";

import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import mongoose from "mongoose";
import { hashPassword } from "@/lib/auth/password";
import { AUDIT_ACTION } from "@/lib/constants/audit";
import { connectDB } from "@/lib/db/mongodb";
import { recordAudit } from "@/lib/services/audit.service";
import { InvalidRequestError, TooManyRequestsError } from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";
import { normalizeEmail } from "@/lib/validations/common";
import { Customer } from "@/models/Customer";
import { PasswordResetOTP } from "@/models/PasswordResetOTP";

export const RESET_COOKIE = "nexora_password_reset";
const OTP_TTL_MS = 10 * 60 * 1000; const RESET_TTL_MS = 10 * 60 * 1000; const COOLDOWN_MS = 60_000; const MAX_ATTEMPTS = 5; const MAX_REQUESTS_PER_HOUR = 5;
function secret() { const value = process.env.AUTH_SECRET?.trim(); if (!value || value.length < 32) throw new Error("AUTH_SECRET must be at least 32 characters."); return value; }
function hashOtp(email: string, otp: string) { return createHmac("sha256", secret()).update(`${email}:${otp}`).digest("hex"); }
function hashToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
function safeEqual(a: string, b: string) { const left = Buffer.from(a); const right = Buffer.from(b); return left.length === right.length && timingSafeEqual(left, right); }
export function resetIpHash(request: Request) { const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local"; return createHmac("sha256", secret()).update(ip).digest("hex"); }

async function sendOtp(email: string, otp: string) {
  const apiKey = process.env.RESEND_API_KEY?.trim(); const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !from) throw new Error("Resend is not configured.");
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({
    from, to: [email], subject: "Nexora password reset code", html: `<div style="font-family:Arial,sans-serif;max-width:560px"><h1 style="font-size:22px">Reset your Nexora password</h1><p>Use this verification code:</p><p style="font-size:32px;font-weight:700;letter-spacing:8px">${otp}</p><p>This code expires in 10 minutes. Never share it with anyone.</p><p>If you did not request a password reset, you can ignore this email.</p></div>`,
  }), cache: "no-store" });
  if (!response.ok) throw new Error(`Resend rejected the email (${response.status}).`);
}

export async function requestPasswordReset(emailInput: string, ipHash: string) {
  await connectDB(); const email = normalizeEmail(emailInput); const now = new Date(); const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const [emailCount, ipCount, latest] = await Promise.all([
    PasswordResetOTP.countDocuments({ email, createdAt: { $gte: hourAgo } }), PasswordResetOTP.countDocuments({ ipHash, createdAt: { $gte: hourAgo } }),
    PasswordResetOTP.findOne({ email }).sort({ createdAt: -1 }).select("createdAt").lean<{ createdAt: Date } | null>(),
  ]);
  if (emailCount >= MAX_REQUESTS_PER_HOUR || ipCount >= MAX_REQUESTS_PER_HOUR * 4) throw new TooManyRequestsError("Too many reset requests. Please try again later.", 3600);
  if (latest && now.getTime() - new Date(latest.createdAt).getTime() < COOLDOWN_MS) throw new TooManyRequestsError("Please wait before requesting another code.", Math.ceil((COOLDOWN_MS - (now.getTime() - new Date(latest.createdAt).getTime())) / 1000));
  const otp = String(randomInt(100000, 1_000_000));
  const customer = await Customer.findOne({ email }).select("_id +passwordHash isActive").lean<{ _id: mongoose.Types.ObjectId; passwordHash?: string; isActive?: boolean } | null>();
  await PasswordResetOTP.updateMany({ email, usedAt: null }, { $set: { usedAt: now } });
  await PasswordResetOTP.create({ customerId: customer?._id ?? null, email, otpHash: hashOtp(email, otp), ipHash, attempts: 0, expiresAt: new Date(now.getTime() + OTP_TTL_MS) });
  await recordAudit({ actorStaffId: null, action: AUDIT_ACTION.PASSWORD_RESET_REQUESTED, metadata: { customerId: customer?._id ? String(customer._id) : null } });
  if (customer?.passwordHash && customer.isActive !== false) {
    try { await sendOtp(email, otp); } catch (error) { logger.error("Password reset email delivery failed", error, { customerId: String(customer._id) }); }
  }
  return { message: "If an account exists for this email, a verification code has been sent.", cooldownSeconds: 60, expiresInMinutes: 10 };
}

export async function verifyPasswordResetOtp(emailInput: string, otp: string): Promise<{ token: string; customerId: string }> {
  await connectDB(); const email = normalizeEmail(emailInput); const record = await PasswordResetOTP.findOne({ email, usedAt: null }).sort({ createdAt: -1 });
  if (!record || record.expiresAt <= new Date() || record.attempts >= MAX_ATTEMPTS || !record.customerId) throw new InvalidRequestError("That code is invalid or expired.");
  if (!safeEqual(record.otpHash, hashOtp(email, otp))) { record.attempts += 1; if (record.attempts >= MAX_ATTEMPTS) record.usedAt = new Date(); await record.save(); throw new InvalidRequestError(record.attempts >= MAX_ATTEMPTS ? "Too many incorrect attempts. Request a new code." : "That code is invalid or expired."); }
  const token = randomBytes(32).toString("base64url"); record.verifiedAt = new Date(); record.resetTokenHash = hashToken(token); record.resetTokenExpiresAt = new Date(Date.now() + RESET_TTL_MS); await record.save(); return { token, customerId: String(record.customerId) };
}

export async function completePasswordReset(token: string, password: string) {
  await connectDB(); const record = await PasswordResetOTP.findOne({ resetTokenHash: hashToken(token), usedAt: null, verifiedAt: { $ne: null }, resetTokenExpiresAt: { $gt: new Date() } });
  if (!record?.customerId) throw new InvalidRequestError("Your reset authorization is invalid or expired.");
  const passwordHash = await hashPassword(password); const session = await mongoose.startSession();
  try { await session.withTransaction(async () => {
    const claimed = await PasswordResetOTP.findOneAndUpdate({ _id: record._id, usedAt: null, resetTokenExpiresAt: { $gt: new Date() } }, { $set: { usedAt: new Date(), resetTokenHash: null } }, { session, returnDocument: "after" });
    if (!claimed) throw new InvalidRequestError("This reset authorization has already been used.");
    await Customer.updateOne({ _id: record.customerId, isActive: true }, { $set: { passwordHash } }, { session });
  }); } finally { await session.endSession(); }
  await recordAudit({ actorStaffId: null, action: AUDIT_ACTION.PASSWORD_RESET_COMPLETED, metadata: { customerId: String(record.customerId) } });
}
