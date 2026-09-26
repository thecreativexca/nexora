import mongoose, { Schema, type Model, type Types } from "mongoose";

import { CUSTOMER_MODEL } from "@/lib/constants/staff";

/**
 * Server-side customer session.
 *
 * The browser only ever receives an opaque random token in an HttpOnly cookie.
 * The database stores a SHA-256 hash of that token, so a leaked database dump
 * cannot be replayed as a live session, and logout can invalidate the session
 * server-side instead of relying on the browser to forget a cookie.
 */
export interface CustomerSessionDocument {
  customerId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const customerSessionSchema = new Schema<CustomerSessionDocument>(
  {
    customerId: {
      type: Schema.Types.ObjectId,
      ref: CUSTOMER_MODEL,
      required: true,
    },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, versionKey: false },
);

/** Sessions are removed automatically once they expire. */
customerSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
/** Allows "sign out everywhere" and auditing per customer. */
customerSessionSchema.index({ customerId: 1, createdAt: -1 });

export const CustomerSession: Model<CustomerSessionDocument> =
  (mongoose.models.CustomerSession as Model<CustomerSessionDocument> | undefined) ??
  mongoose.model<CustomerSessionDocument>("CustomerSession", customerSessionSchema);

export default CustomerSession;
