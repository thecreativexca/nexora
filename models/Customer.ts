import mongoose, { Schema, type Model } from "mongoose";

import {
  addressSubSchema,
  type AddressFields,
} from "@/models/schema-helpers";

export type CustomerAddress = AddressFields;

/**
 * Optional storefront customer account.
 *
 * Guest checkout never touches this collection. A customer record exists only
 * when somebody chooses to register, and is linked to orders through the
 * optional `Order.customerId`.
 */
export interface CustomerDocument {
  email: string;
  /** bcrypt hash - never selected by default and never serialised. */
  passwordHash?: string;
  name: string;
  phone: string;
  address: CustomerAddress | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const customerSchema = new Schema<CustomerDocument>(
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
      required: false,
      /** Hidden unless a query explicitly asks for it (login only). */
      select: false,
    },
    name: {
      type: String,
      required: [true, "Name is required."],
      trim: true,
      maxlength: 120,
    },
    phone: { type: String, trim: true, default: "", maxlength: 24 },
    /** A single saved/default address for checkout prefill. */
    address: { type: addressSubSchema(), default: null },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

/** Backs the unique email constraint and login lookups. */
customerSchema.index({ email: 1 }, { unique: true });
/** Staff customer directory filters and newest-account sorting. */
customerSchema.index({ isActive: 1, createdAt: -1 });

export const Customer: Model<CustomerDocument> =
  (mongoose.models.Customer as Model<CustomerDocument> | undefined) ??
  mongoose.model<CustomerDocument>("Customer", customerSchema);

export default Customer;
