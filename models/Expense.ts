import mongoose, { Schema, type Model, type Types } from "mongoose";

import { STAFF_PROFILE_MODEL } from "@/lib/constants/staff";
import {
  EXPENSE_CATEGORY_VALUES,
  EXPENSE_STATUS,
  EXPENSE_STATUS_VALUES,
  type ExpenseCategory,
  type ExpenseStatus,
} from "@/lib/constants/expense";
import { paiseField } from "@/models/schema-helpers";

export {
  EXPENSE_CATEGORY,
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_CATEGORY_VALUES,
  EXPENSE_STATUS,
  EXPENSE_STATUS_VALUES,
} from "@/lib/constants/expense";
export type { ExpenseCategory, ExpenseStatus } from "@/lib/constants/expense";

export interface ExpenseDocument {
  _id: Types.ObjectId;
  expenseNumber: string;
  category: ExpenseCategory;
  amountInPaise: number;
  expenseDate: Date;
  description: string;
  paymentMethod: string;
  storeId?: string | null;
  createdByStaffId: Types.ObjectId;
  createdByName: string;
  approvedByStaffId?: Types.ObjectId | null;
  approvedByName?: string | null;
  receiptUrl?: string;
  status: ExpenseStatus;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

const expenseSchema = new Schema<ExpenseDocument>(
  {
    expenseNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      maxlength: 32,
    },
    category: {
      type: String,
      enum: EXPENSE_CATEGORY_VALUES,
      required: [true, "Expense category is required."],
      index: true,
    },
    amountInPaise: paiseField({ required: true }),
    expenseDate: {
      type: Date,
      required: [true, "Expense date is required."],
      default: Date.now,
      index: true,
    },
    description: {
      type: String,
      required: [true, "Description is required."],
      trim: true,
      maxlength: 500,
    },
    paymentMethod: {
      type: String,
      required: true,
      trim: true,
      default: "CASH",
      maxlength: 50,
    },
    storeId: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    createdByStaffId: {
      type: Schema.Types.ObjectId,
      ref: STAFF_PROFILE_MODEL,
      required: true,
      index: true,
    },
    createdByName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    approvedByStaffId: {
      type: Schema.Types.ObjectId,
      ref: STAFF_PROFILE_MODEL,
      default: null,
    },
    approvedByName: {
      type: String,
      trim: true,
      default: null,
      maxlength: 120,
    },
    receiptUrl: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: EXPENSE_STATUS_VALUES,
      default: EXPENSE_STATUS.PAID,
      required: true,
      index: true,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },
  },
  { timestamps: true, versionKey: false },
);

expenseSchema.index({ expenseDate: -1, status: 1 });
expenseSchema.index({ category: 1, expenseDate: -1 });
expenseSchema.index({ storeId: 1, expenseDate: -1 });

export const Expense: Model<ExpenseDocument> =
  (mongoose.models.Expense as Model<ExpenseDocument> | undefined) ??
  mongoose.model<ExpenseDocument>("Expense", expenseSchema);

export default Expense;
