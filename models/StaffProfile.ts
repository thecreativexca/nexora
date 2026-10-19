import mongoose, { Schema, type Model, type Types } from "mongoose";

import {
  ALL_STAFF_PERMISSIONS,
  STAFF_PROFILE_MODEL,
  STAFF_ROLE,
  STAFF_ROLE_VALUES,
  type StaffPermission,
  type StaffRole,
} from "@/lib/constants/staff";

/**
 * A member of the staff team (Phase 2).
 *
 * Security rules:
 * - `passwordHash` (bcrypt) is `select: false` and never serialised.
 * - Login helpers must opt in with `.select("+passwordHash")`.
 *
 * Permission overrides:
 * - `permissionGrants`: Permissions explicitly added beyond the role default.
 * - `permissionDenies`: Permissions explicitly removed from the role default.
 * - `resolveEffectivePermissions()` in lib/constants/staff applies these overrides.
 * - Overrides may only be set by an Admin, enforced server-side.
 * - Admins themselves cannot have their permissions restricted (deny list ignored).
 */
export interface StaffProfileDocument {
  email: string;
  passwordHash: string;
  name: string;
  role: StaffRole;
  isActive: boolean;
  /** Permissions explicitly granted beyond the role default. */
  permissionGrants: StaffPermission[];
  /** Permissions explicitly revoked from the role default. */
  permissionDenies: StaffPermission[];
  lastLoginAt: Date | null;
  passwordChangedAt: Date | null;
  failedLoginCount: number;
  lockedUntil: Date | null;
  invitedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const permissionEnum = ALL_STAFF_PERMISSIONS as unknown as string[];

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
      default: STAFF_ROLE.SELLER,
    },
    isActive: { type: Boolean, default: true },
    /**
     * Permission grants – validated against the full permissions enum so
     * unknown strings can never be injected through a MongoDB direct write.
     */
    permissionGrants: {
      type: [String],
      enum: permissionEnum,
      default: [],
    },
    /**
     * Permission denies – same validation as grants.
     * Admin roles have their denies silently ignored in resolveEffectivePermissions.
     */
    permissionDenies: {
      type: [String],
      enum: permissionEnum,
      default: [],
    },
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
/** Active staff filter. */
staffProfileSchema.index({ isActive: 1, role: 1 });

export const StaffProfile: Model<StaffProfileDocument> =
  (mongoose.models.StaffProfile as Model<StaffProfileDocument> | undefined) ??
  mongoose.model<StaffProfileDocument>("StaffProfile", staffProfileSchema);

export default StaffProfile;