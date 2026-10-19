import mongoose, { Schema, type Model, type Types } from "mongoose";

import { STAFF_PROFILE_MODEL } from "@/lib/constants/staff";
import { paiseField } from "@/models/schema-helpers";

export interface DailyClosingSellerRow {
  staffId: Types.ObjectId;
  staffName: string;
  cashCollectedInPaise: number;
  orderCount: number;
}

export interface DailyClosingTenderRow {
  method: string;
  amountInPaise: number;
  count: number;
}

export interface DailyClosingDocument {
  _id: Types.ObjectId;
  closingNumber: string;
  closingDate: string; // YYYY-MM-DD
  businessDate: Date;
  storeId?: string | null;
  openingCashInPaise: number;
  cashSalesInPaise: number;
  cashDueCollectionsInPaise: number;
  cashRefundsInPaise: number;
  cashPaidOutInPaise: number;
  expectedClosingCashInPaise: number;
  actualCountedCashInPaise: number;
  differenceInPaise: number;
  sellerBreakdown: DailyClosingSellerRow[];
  tenderBreakdown: DailyClosingTenderRow[];
  notes: string;
  closedByStaffId: Types.ObjectId;
  closedByName: string;
  approvedByStaffId?: Types.ObjectId | null;
  approvedByName?: string | null;
  isFinalized: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const sellerRowSchema = new Schema<DailyClosingSellerRow>(
  {
    staffId: {
      type: Schema.Types.ObjectId,
      ref: STAFF_PROFILE_MODEL,
      required: true,
    },
    staffName: { type: String, required: true, trim: true },
    cashCollectedInPaise: paiseField({ required: true, default: 0 }),
    orderCount: { type: Number, required: true, default: 0 },
  },
  { _id: false },
);

const tenderRowSchema = new Schema<DailyClosingTenderRow>(
  {
    method: { type: String, required: true, trim: true },
    amountInPaise: paiseField({ required: true, default: 0 }),
    count: { type: Number, required: true, default: 0 },
  },
  { _id: false },
);

const dailyClosingSchema = new Schema<DailyClosingDocument>(
  {
    closingNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      maxlength: 32,
    },
    closingDate: {
      type: String,
      required: true,
      trim: true,
      maxlength: 10,
      index: true,
    },
    businessDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    storeId: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    openingCashInPaise: paiseField({ required: false, default: 0 }),
    cashSalesInPaise: paiseField({ required: true, default: 0 }),
    cashDueCollectionsInPaise: paiseField({ required: false, default: 0 }),
    cashRefundsInPaise: paiseField({ required: false, default: 0 }),
    cashPaidOutInPaise: paiseField({ required: false, default: 0 }),
    expectedClosingCashInPaise: { type: Number, required: true, default: 0 },
    actualCountedCashInPaise: paiseField({ required: true }),
    differenceInPaise: { type: Number, required: true, default: 0 },
    sellerBreakdown: { type: [sellerRowSchema], default: [] },
    tenderBreakdown: { type: [tenderRowSchema], default: [] },
    notes: { type: String, trim: true, default: "", maxlength: 1000 },
    closedByStaffId: {
      type: Schema.Types.ObjectId,
      ref: STAFF_PROFILE_MODEL,
      required: true,
      index: true,
    },
    closedByName: { type: String, required: true, trim: true, maxlength: 120 },
    approvedByStaffId: {
      type: Schema.Types.ObjectId,
      ref: STAFF_PROFILE_MODEL,
      default: null,
    },
    approvedByName: { type: String, trim: true, default: null, maxlength: 120 },
    isFinalized: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, versionKey: false },
);

dailyClosingSchema.index({ closingDate: 1, storeId: 1 }, { unique: true });
dailyClosingSchema.index({ createdAt: -1 });

export const DailyClosing: Model<DailyClosingDocument> =
  (mongoose.models.DailyClosing as Model<DailyClosingDocument> | undefined) ??
  mongoose.model<DailyClosingDocument>("DailyClosing", dailyClosingSchema);

export default DailyClosing;
