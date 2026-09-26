import mongoose, { Schema, type Model, type Types } from "mongoose";

import {
  STAFF_PROFILE_MODEL,
  STAFF_ROLE,
  STAFF_ROLE_VALUES,
  type StaffRole,
} from "@/lib/constants/staff";

/**
 * A member of the staff team (Phase 3).
 *
 * Security rules:
 * - `passwordHash` (bcrypt) is `select: false` and never serialised.
 * - `mfaSecretEncrypted` is AES-256-GCM ciphertext at rest and `select: false`.
 * - Login helpers must opt in with `.select("+passwordHash +mfaSecretEncrypted")`.
 */
export interface StaffProfileDocument {
  email: string;
  passwordHash: string;
  name: string;
  role: StaffRole;
  isActive: boolean;
  mfaEnabled: boolean;
  mfaSecretEncrypted: string | null;
  mfaVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  passwordChangedAt: Date | null;
  failedLoginCount: number;
  lockedUntil: Date | null;
  invitedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const staffProfileSchema = new Schema<StaffProfileDocument>(
  {
    email: {
      type: String,
      required: [true, "Email is required."],
      trim: true,
      lowercase: true,
      maxlength: 254,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    name: {
      type: String,
      required: [true, "Name is required."],
      trim: true,
      maxlength: 120,
    },
    role: {
      type: String,
      enum: STAFF_ROLE_VALUES,
      required: true,
      default: STAFF_ROLE.CASHIER,
    },
    isActive: { type: Boolean, default: true },
    mfaEnabled: { type: Boolean, default: false },
    mfaSecretEncrypted: { type: String, default: null, select: false },
    mfaVerifiedAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    passwordChangedAt: { type: Date, default: null },
    failedLoginCount: { type: Number, default: 0, min: 0 },
    lockedUntil: { type: Date, default: null },
    invitedBy: {
      type: Schema.Types.ObjectId,
      ref: STAFF_PROFILE_MODEL,
      default: null,
    },
  },
  { timestamps: true, versionKey: false },
);

/** Backs the unique email constraint and login lookups. */
staffProfileSchema.index({ email: 1 }, { unique: true });
/** Team list / management screens. */
staffProfileSchema.index({ role: 1, createdAt: -1 });

export const StaffProfile: Model<StaffProfileDocument> =
  (mongoose.models.StaffProfile as Model<StaffProfileDocument> | undefined) ??
  mongoose.model<StaffProfileDocument>("StaffProfile", staffProfileSchema);

export default StaffProfile;