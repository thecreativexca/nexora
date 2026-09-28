import mongoose, { Schema, type Model, type Types } from "mongoose";

export interface StaffLoginOTPDocument {
  staffId: Types.ObjectId;
  email: string;
  otpHash: string;
  attempts: number;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<StaffLoginOTPDocument>({
  staffId: { type: Schema.Types.ObjectId, ref: "StaffProfile", required: true },
  email: { type: String, required: true, lowercase: true },
  otpHash: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false });

schema.index({ staffId: 1, createdAt: -1 });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 86400 });

export const StaffLoginOTP: Model<StaffLoginOTPDocument> =
  (mongoose.models.StaffLoginOTP as Model<StaffLoginOTPDocument> | undefined) ??
  mongoose.model<StaffLoginOTPDocument>("StaffLoginOTP", schema);