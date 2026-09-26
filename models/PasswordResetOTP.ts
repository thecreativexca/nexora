import mongoose, { Schema, type Model, type Types } from "mongoose";
export interface PasswordResetOTPDocument { customerId: Types.ObjectId | null; email: string; otpHash: string; ipHash: string; attempts: number; expiresAt: Date; usedAt: Date | null; verifiedAt: Date | null; resetTokenHash: string | null; resetTokenExpiresAt: Date | null; createdAt: Date; updatedAt: Date; }
const schema = new Schema<PasswordResetOTPDocument>({
  customerId: { type: Schema.Types.ObjectId, ref: "Customer", default: null }, email: { type: String, required: true, lowercase: true },
  otpHash: { type: String, required: true }, ipHash: { type: String, required: true }, attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true }, usedAt: { type: Date, default: null }, verifiedAt: { type: Date, default: null },
  resetTokenHash: { type: String, default: null }, resetTokenExpiresAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false });
schema.index({ email: 1, createdAt: -1 }); schema.index({ ipHash: 1, createdAt: -1 }); schema.index({ expiresAt: 1 }, { expireAfterSeconds: 86400 });
export const PasswordResetOTP: Model<PasswordResetOTPDocument> = (mongoose.models.PasswordResetOTP as Model<PasswordResetOTPDocument> | undefined) ?? mongoose.model<PasswordResetOTPDocument>("PasswordResetOTP", schema);
