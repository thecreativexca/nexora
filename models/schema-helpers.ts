import { Schema, type SchemaTypeOptions } from "mongoose";

/**
 * Shared Mongoose field builders.
 *
 * Money is always stored as an integer number of minor units (paise) so the
 * database itself rejects fractional or negative amounts.
 */

/**
 * Postal address shared by the customer profile and order delivery snapshots.
 *
 * The same builder is used in both places so the two can never drift, while
 * each document still owns an independent copy of the data.
 */
export interface AddressFields {
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export function addressSubSchema(): Schema<AddressFields> {
  return new Schema<AddressFields>(
    {
      line1: { type: String, required: true, trim: true, maxlength: 160 },
      line2: { type: String, trim: true, default: "", maxlength: 160 },
      city: { type: String, required: true, trim: true, maxlength: 80 },
      state: { type: String, required: true, trim: true, maxlength: 80 },
      postalCode: { type: String, required: true, trim: true, maxlength: 12 },
      country: { type: String, required: true, trim: true, maxlength: 60 },
    },
    { _id: false },
  );
}
export function paiseField(options: { required?: boolean; default?: number } = {}): SchemaTypeOptions<number> {
  return {
    type: Number,
    required: options.required ?? true,
    ...(options.default === undefined ? {} : { default: options.default }),
    min: [0, "Amount cannot be negative."],
    validate: {
      validator: (value: number) => Number.isSafeInteger(value),
      message: "Amount must be an integer number of paise.",
    },
  };
}

export function nonNegativeIntegerField(options: { default?: number; required?: boolean } = {}): SchemaTypeOptions<number> {
  return {
    type: Number,
    required: options.required ?? true,
    ...(options.default === undefined ? {} : { default: options.default }),
    min: [0, "Value cannot be negative."],
    validate: {
      validator: (value: number) => Number.isInteger(value),
      message: "Value must be a whole number.",
    },
  };
}

export function positiveIntegerField(): SchemaTypeOptions<number> {
  return {
    type: Number,
    required: true,
    min: [1, "Quantity must be at least 1."],
    validate: {
      validator: (value: number) => Number.isInteger(value),
      message: "Quantity must be a whole number.",
    },
  };
}
