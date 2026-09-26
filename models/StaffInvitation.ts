import mongoose, { Schema, type Model, type Types } from "mongoose";

import {
  STAFF_PROFILE_MODEL,
  STAFF_ROLE_VALUES,
  type StaffRole,
} from "@/lib/constants/staff";

/**
 * Staff invitation (Phase 3).
 *
 * - The one-time code is never stored - only its SHA-256 hash.
 * - Invitations are single-use and expire after 7 days.
 * - A TTL index removes stale rows from MongoDB, but the UI derives status from
 *   `expiresAt`/`usedAt` so expiration state never depends on collection cleanup.
 */
export interface StaffInvitationDocument {
  email: string;
  role: StaffRole;
  /** SHA-256 hex of the one-time code shown to the invitee. */
  codeHash: string;
  invitedBy: Types.ObjectId;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const staffInvitationSchema = new Schema<StaffInvitationDocument>(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
    },
    role: {
      type: String,
      enum: STAFF_ROLE_VALUES,
      required: true,
    },
    codeHash: { type: String, required: true, unique: true },
    invitedBy: {
      type: Schema.Types.ObjectId,
      ref: STAFF_PROFILE_MODEL,
      required: true,
    },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

/** Best-effort cleanup of expired invitations (UI derives expiry itself). */
staffInvitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
/** Team Access screen: invitations for one actor. */
staffInvitationSchema.index({ invitedBy: 1, createdAt: -1 });
/** Duplicate-invitation detection for a target email. */
staffInvitationSchema.index({ email: 1, createdAt: -1 });

export const StaffInvitation: Model<StaffInvitationDocument> =
  (mongoose.models.StaffInvitation as Model<StaffInvitationDocument> | undefined) ??
  mongoose.model<StaffInvitationDocument>("StaffInvitation", staffInvitationSchema);

export default StaffInvitation;