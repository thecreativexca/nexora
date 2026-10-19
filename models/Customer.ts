import mongoose, { Schema, type Model } from "mongoose";

import {
  addressSubSchema,
  paiseField,
  type AddressFields,
} from "@/models/schema-helpers";

export type CustomerAddress = AddressFields;

/**
 * Customer account for storefront or in-store POS.
 *
 * Linked to orders through optional `Order.customerId`.
 */
export interface CustomerDocument {
  email: string;
  /** bcrypt hash - never selected by default and never serialised. Optional for walk-in/in-store profiles. */
  passwordHash?: string;
  name: string;
  phone: string;
  address: CustomerAddress | null;
  notes?: string;
  outstandingDueInPaise: number;
  totalPurchasesInPaise: number;
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
      select: false,
    },
    name: {
      type: String,
      required: [true, "Name is required."],
      trim: true,
      maxlength: 120,
    },
    phone: { type: String, trim: true, default: "", maxlength: 24 },
    address: { type: addressSubSchema(), default: null },
    notes: { type: String, trim: true, default: "", maxlength: 1000 },
    outstandingDueInPaise: paiseField({ required: false, default: 0 }),
    totalPurchasesInPaise: paiseField({ required: false, default: 0 }),
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

/** Backs the unique email constraint and login lookups. */
customerSchema.index({ email: 1 }, { unique: true });
/** Staff customer directory filters and newest-account sorting. */
customerSchema.index({ isActive: 1, createdAt: -1 });
customerSchema.index({ phone: 1 });
customerSchema.index({ outstandingDueInPaise: -1 });
customerSchema.index({ totalPurchasesInPaise: -1 });

export const Customer: Model<CustomerDocument> =
  (mongoose.models.Customer as Model<CustomerDocument> | undefined) ??
  mongoose.model<CustomerDocument>("Customer", customerSchema);

export default Customer;
