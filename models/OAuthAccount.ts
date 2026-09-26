import mongoose, { Schema, type Model, type Types } from "mongoose";

export interface OAuthAccountDocument { customerId: Types.ObjectId; provider: "google" | "facebook"; providerAccountId: string; createdAt: Date; updatedAt: Date; }
const schema = new Schema<OAuthAccountDocument>({
  customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
  provider: { type: String, enum: ["google", "facebook"], required: true },
  providerAccountId: { type: String, required: true, trim: true },
}, { timestamps: true, versionKey: false });
schema.index({ provider: 1, providerAccountId: 1 }, { unique: true });
schema.index({ customerId: 1, provider: 1 }, { unique: true });
export const OAuthAccount: Model<OAuthAccountDocument> = (mongoose.models.OAuthAccount as Model<OAuthAccountDocument> | undefined) ?? mongoose.model<OAuthAccountDocument>("OAuthAccount", schema);
