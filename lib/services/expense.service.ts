import "server-only";

import { Types } from "mongoose";

import { AUDIT_ACTION } from "@/lib/constants/audit";
import { isAdminRole, isSellerRole } from "@/lib/constants/staff";
import { connectDB } from "@/lib/db/mongodb";
import { recordAuditLog } from "@/lib/services/audit.service";
import { toDatabaseError } from "@/lib/services/service-errors";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  isAppError,
  isConnectionError,
} from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";
import {
  Expense,
  EXPENSE_CATEGORY_VALUES,
  EXPENSE_STATUS,
  type ExpenseCategory,
  type ExpenseDocument,
  type ExpenseStatus,
} from "@/models/Expense";
import type { StaffView } from "@/types/staff";

export interface CreateExpenseInput {
  category: ExpenseCategory;
  amountInPaise: number;
  description: string;
  expenseDate?: string | Date;
  paymentMethod?: string;
  storeId?: string | null;
  receiptUrl?: string;
  notes?: string;
}

export interface ListExpensesFilter {
  category?: ExpenseCategory;
  status?: ExpenseStatus;
  storeId?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  pageSize?: number;
}

function generateExpenseNumber(): string {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const date = new Date();
  const datePart = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("");
  let randomPart = "";
  for (let i = 0; i < 4; i += 1) {
    randomPart += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `EXP-${datePart}-${randomPart}`;
}

export async function createExpense(
  input: CreateExpenseInput,
  actor: StaffView,
): Promise<ExpenseDocument> {
  if (isSellerRole(actor.role)) {
    throw new ForbiddenError("Sellers are not authorized to create expenses.");
  }

  if (!EXPENSE_CATEGORY_VALUES.includes(input.category)) {
    throw new BadRequestError(`Invalid expense category: ${input.category}`);
  }

  if (typeof input.amountInPaise !== "number" || input.amountInPaise <= 0 || !Number.isInteger(input.amountInPaise)) {
    throw new BadRequestError("Expense amount must be a positive integer in paise.");
  }

  if (!input.description || input.description.trim().length === 0) {
    throw new BadRequestError("Expense description is required.");
  }

  try {
    await connectDB();
  } catch (error) {
    throw toDatabaseError(error);
  }

  const expenseDate = input.expenseDate ? new Date(input.expenseDate) : new Date();
  if (Number.isNaN(expenseDate.getTime())) {
    throw new BadRequestError("Invalid expense date.");
  }

  try {
    const expense = await Expense.create({
      expenseNumber: generateExpenseNumber(),
      category: input.category,
      amountInPaise: input.amountInPaise,
      expenseDate,
      description: input.description.trim(),
      paymentMethod: input.paymentMethod?.trim() || "CASH",
      storeId: input.storeId?.trim() || null,
      createdByStaffId: new Types.ObjectId(actor.id),
      createdByName: actor.name,
      approvedByStaffId: isAdminRole(actor.role) ? new Types.ObjectId(actor.id) : null,
      approvedByName: isAdminRole(actor.role) ? actor.name : null,
      status: isAdminRole(actor.role) ? EXPENSE_STATUS.APPROVED : EXPENSE_STATUS.PENDING,
      receiptUrl: input.receiptUrl?.trim() || "",
      notes: input.notes?.trim() || "",
    });

    await recordAuditLog({
      action: AUDIT_ACTION.EXPENSE_CREATED,
      actor: { staffId: actor.id, role: actor.role, name: actor.name },
      target: { type: "EXPENSE", id: String(expense._id), label: expense.expenseNumber },
      metadata: {
        category: expense.category,
        amountInPaise: expense.amountInPaise,
        status: expense.status,
      },
    });

    return expense;
  } catch (error) {
    if (isAppError(error)) throw error;
    if (!isConnectionError(error)) {
      logger.error("Failed to create expense", error);
    }
    throw toDatabaseError(error);
  }
}

export async function listExpenses(
  filter: ListExpensesFilter,
  actor: StaffView,
): Promise<{ expenses: ExpenseDocument[]; total: number; page: number; pageSize: number }> {
  if (isSellerRole(actor.role)) {
    throw new ForbiddenError("Sellers cannot access expense records.");
  }

  try {
    await connectDB();
  } catch (error) {
    throw toDatabaseError(error);
  }

  const query: Record<string, unknown> = {};

  if (filter.category) {
    query.category = filter.category;
  }

  if (filter.status) {
    query.status = filter.status;
  }

  if (filter.storeId) {
    query.storeId = filter.storeId;
  }

  if (filter.startDate || filter.endDate) {
    const dateQuery: Record<string, Date> = {};
    if (filter.startDate) dateQuery.$gte = filter.startDate;
    if (filter.endDate) dateQuery.$lte = filter.endDate;
    query.expenseDate = dateQuery;
  }

  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 20));

  try {
    const [expenses, total] = await Promise.all([
      Expense.find(query)
        .sort({ expenseDate: -1, createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean<ExpenseDocument[]>(),
      Expense.countDocuments(query),
    ]);

    return { expenses, total, page, pageSize };
  } catch (error) {
    if (isAppError(error)) throw error;
    if (!isConnectionError(error)) {
      logger.error("Failed to list expenses", error);
    }
    throw toDatabaseError(error);
  }
}

export async function approveExpense(
  id: string,
  approved: boolean,
  actor: StaffView,
): Promise<ExpenseDocument> {
  if (!isAdminRole(actor.role)) {
    throw new ForbiddenError("Only Administrators can approve or reject expenses.");
  }

  if (!Types.ObjectId.isValid(id)) {
    throw new BadRequestError("Invalid expense ID.");
  }

  try {
    await connectDB();
  } catch (error) {
    throw toDatabaseError(error);
  }

  try {
    const expense = await Expense.findById(id);
    if (!expense) throw new NotFoundError("Expense record not found.");

    expense.status = approved ? EXPENSE_STATUS.APPROVED : EXPENSE_STATUS.REJECTED;
    expense.approvedByStaffId = new Types.ObjectId(actor.id);
    expense.approvedByName = actor.name;
    await expense.save();

    await recordAuditLog({
      action: approved ? AUDIT_ACTION.EXPENSE_APPROVED : AUDIT_ACTION.EXPENSE_REJECTED,
      actor: { staffId: actor.id, role: actor.role, name: actor.name },
      target: { type: "EXPENSE", id: String(expense._id), label: expense.expenseNumber },
      metadata: { status: expense.status },
    });

    return expense;
  } catch (error) {
    if (isAppError(error)) throw error;
    if (!isConnectionError(error)) {
      logger.error("Failed to approve expense", error);
    }
    throw toDatabaseError(error);
  }
}

export async function getExpenseTotalInPaise(
  startDate: Date,
  endDate: Date,
  storeId?: string | null,
): Promise<{ totalInPaise: number; count: number; byCategory: Record<string, number> }> {
  try {
    await connectDB();
  } catch (error) {
    throw toDatabaseError(error);
  }

  const match: Record<string, unknown> = {
    expenseDate: { $gte: startDate, $lt: endDate },
    status: { $in: [EXPENSE_STATUS.APPROVED, EXPENSE_STATUS.PAID] },
  };

  if (storeId) {
    match.storeId = storeId;
  }

  try {
    const results = await Expense.aggregate<{ _id: string; totalInPaise: number; count: number }>([
      { $match: match },
      {
        $group: {
          _id: "$category",
          totalInPaise: { $sum: "$amountInPaise" },
          count: { $sum: 1 },
        },
      },
    ]);

    let totalInPaise = 0;
    let count = 0;
    const byCategory: Record<string, number> = {};

    for (const r of results) {
      totalInPaise += r.totalInPaise;
      count += r.count;
      byCategory[r._id] = r.totalInPaise;
    }

    return { totalInPaise, count, byCategory };
  } catch (error) {
    if (isAppError(error)) throw error;
    if (!isConnectionError(error)) {
      logger.error("Failed to get expense total", error);
    }
    throw toDatabaseError(error);
  }
}
