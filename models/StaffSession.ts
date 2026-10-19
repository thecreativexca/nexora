import mongoose, { Schema, type Model, type Types } from "mongoose";

import { STAFF_PROFILE_MODEL } from "@/lib/constants/staff";

/**
 * Server-side staff session.
 *
 * The browser only receives an opaque random token in an HttpOnly cookie; the
 * database stores a SHA-256 hash of that token. Logging out deletes the row so
 * a copied cookie is useless immediately.
 */
export interface StaffSessionDocument {
  staffId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const staffSessionSchema = new Schema<StaffSessionDocument>(
  {
    staffId: {
      type: Schema.Types.ObjectId,
      ref: STAFF_PROFILE_MODEL,
      required: true,
    },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, versionKey: false },
);

staffSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
staffSessionSchema.index({ staffId: 1, createdAt: -1 });

export const StaffSession: Model<StaffSessionDocument> =
  (mongoose.models.StaffSession as Model<StaffSessionDocument> | undefined) ??
  mongoose.model<StaffSessionDocument>("StaffSession", staffSessionSchema);

export default StaffSession;