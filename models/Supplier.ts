import mongoose, { Schema, type Model, type Types } from "mongoose";

import {
  addressSubSchema,
  paiseField,
  type AddressFields,
} from "@/models/schema-helpers";

export interface SupplierDocument {
  _id: Types.ObjectId;
  name: string;
  businessName: string;
  contactPerson: string;
  phone: string;
  email: string;
  address?: AddressFields | null;
  gstin?: string;
  notes: string;
  isActive: boolean;
  outstandingDueInPaise: number;
  createdAt: Date;
  updatedAt: Date;
}

const supplierSchema = new Schema<SupplierDocument>(
  {
    name: {
      type: String,
      required: [true, "Supplier name is required."],
      trim: true,
      maxlength: 120,
    },
    businessName: {
      type: String,
      required: [true, "Business name is required."],
      trim: true,
      maxlength: 160,
    },
    contactPerson: {
      type: String,
      trim: true,
      default: "",
      maxlength: 120,
    },
    phone: {
      type: String,
      trim: true,
      default: "",
      maxlength: 30,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
      maxlength: 254,
    },
    address: {
      type: addressSubSchema(),
      default: null,
    },
    gstin: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
      maxlength: 20,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },
    isActive: { type: Boolean, default: true },
    outstandingDueInPaise: paiseField({ required: false, default: 0 }),
  },
  { timestamps: true, versionKey: false },
);

supplierSchema.index({ isActive: 1, name: 1 });
supplierSchema.index({ phone: 1 });
supplierSchema.index({ email: 1 });

export const Supplier: Model<SupplierDocument> =
  (mongoose.models.Supplier as Model<SupplierDocument> | undefined) ??
  mongoose.model<SupplierDocument>("Supplier", supplierSchema);

export default Supplier;
