import mongoose, { Schema, type Model } from "mongoose";
interface Doc { eventId: string; eventType: string; processedAt: Date; createdAt: Date; updatedAt: Date; }
const schema = new Schema<Doc>({ eventId: { type: String, required: true, unique: true }, eventType: { type: String, required: true }, processedAt: { type: Date, required: true } }, { timestamps: true, versionKey: false });
export const PayPalWebhookEvent: Model<Doc> = (mongoose.models.PayPalWebhookEvent as Model<Doc> | undefined) ?? mongoose.model<Doc>("PayPalWebhookEvent", schema);
