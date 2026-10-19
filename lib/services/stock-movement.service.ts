import "server-only";

import { Types, type ClientSession } from "mongoose";

import { connectDB } from "@/lib/db/mongodb";
import { ensureRequestTime } from "@/lib/db/request-time";
import { toDatabaseError } from "@/lib/services/service-errors";
import { logger } from "@/lib/utils/logger";
import {
  StockMovement,
  type StockMovementDocument,
  type StockMovementType,
} from "@/models/StockMovement";

export interface RecordStockMovementInput {
  productId: string | Types.ObjectId;
  productName: string;
  sku: string;
  storeId?: string | null;
  movementType: StockMovementType;
  quantityChange: number;
  quantityBefore: number;
  quantityAfter: number;
  referenceId?: string | null;
  referenceType?: string | null;
  reason: string;
  performedByStaffId?: string | Types.ObjectId | null;
  performedByName: string;
}

/**
 * Appends an immutable, auditable stock ledger entry.
 * Can participate in an active MongoDB session or run standalone.
 */
export async function recordStockMovement(
  input: RecordStockMovementInput,
  session?: ClientSession,
): Promise<StockMovementDocument | null> {
  try {
    await connectDB();

    const doc = {
      productId:
        typeof input.productId === "string"
          ? new Types.ObjectId(input.productId)
          : input.productId,
      productName: input.productName,
      sku: input.sku.toUpperCase(),
      storeId: input.storeId ?? null,
      movementType: input.movementType,
      quantityChange: input.quantityChange,
      quantityBefore: input.quantityBefore,
      quantityAfter: input.quantityAfter,
      referenceId: input.referenceId ?? null,
      referenceType: input.referenceType ?? null,
      reason: input.reason,
      performedByStaffId:
        input.performedByStaffId && typeof input.performedByStaffId === "string"
          ? new Types.ObjectId(input.performedByStaffId)
          : (input.performedByStaffId as Types.ObjectId | null) ?? null,
      performedByName: input.performedByName || "System",
    };

    if (session) {
      const [created] = await StockMovement.create([doc], { session });
      return created;
    }

    const created = await StockMovement.create(doc);
    return created;
  } catch (error) {
    logger.error("Failed to record stock movement ledger entry", error, {
      productId: String(input.productId),
      movementType: input.movementType,
    });
    return null;
  }
}

export interface ListStockMovementsInput {
  productId?: string;
  sku?: string;
  movementType?: string;
  page?: number;
  pageSize?: number;
}

export interface StockMovementView {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  movementType: StockMovementType;
  quantityChange: number;
  quantityBefore: number;
  quantityAfter: number;
  referenceId: string | null;
  referenceType: string | null;
  reason: string;
  performedByName: string;
  createdAt: string;
}

export interface StockMovementListResult {
  movements: StockMovementView[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function listStockMovements(
  input: ListStockMovementsInput = {},
): Promise<StockMovementListResult> {
  await ensureRequestTime();

  try {
    await connectDB();

    const filter: Record<string, unknown> = {};
    if (input.productId && Types.ObjectId.isValid(input.productId)) {
      filter.productId = new Types.ObjectId(input.productId);
    }
    if (input.sku) {
      filter.sku = input.sku.trim().toUpperCase();
    }
    if (input.movementType) {
      filter.movementType = input.movementType;
    }

    const page = Math.max(1, input.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 50));

    const [rows, total] = await Promise.all([
      StockMovement.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      StockMovement.countDocuments(filter),
    ]);

    return {
      movements: rows.map((r) => ({
        id: String(r._id),
        productId: String(r.productId),
        productName: r.productName,
        sku: r.sku,
        movementType: r.movementType,
        quantityChange: r.quantityChange,
        quantityBefore: r.quantityBefore,
        quantityAfter: r.quantityAfter,
        referenceId: r.referenceId ?? null,
        referenceType: r.referenceType ?? null,
        reason: r.reason,
        performedByName: r.performedByName,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  } catch (error) {
    throw toDatabaseError(error);
  }
}
