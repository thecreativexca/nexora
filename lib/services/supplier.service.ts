import "server-only";

import { Types } from "mongoose";

import { AUDIT_ACTION } from "@/lib/constants/audit";
import { connectDB } from "@/lib/db/mongodb";
import { ensureRequestTime } from "@/lib/db/request-time";
import { recordAudit } from "@/lib/services/audit.service";
import { toDatabaseError } from "@/lib/services/service-errors";
import { NotFoundError, InvalidRequestError } from "@/lib/utils/errors";
import { normalizeSearchTerm, buildContainsRegExp } from "@/lib/utils/search";
import { Supplier, type SupplierDocument } from "@/models/Supplier";
import type { StaffView } from "@/types/staff";

export interface SupplierInput {
  name: string;
  businessName: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  } | null;
  gstin?: string;
  notes?: string;
}

export interface SupplierView {
  id: string;
  name: string;
  businessName: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: SupplierDocument["address"] | null;
  gstin: string;
  notes: string;
  isActive: boolean;
  outstandingDueInPaise: number;
  createdAt: string;
  updatedAt: string;
}

export function toSupplierView(supplier: SupplierDocument): SupplierView {
  return {
    id: String(supplier._id),
    name: supplier.name,
    businessName: supplier.businessName,
    contactPerson: supplier.contactPerson ?? "",
    phone: supplier.phone ?? "",
    email: supplier.email ?? "",
    address: supplier.address ?? null,
    gstin: supplier.gstin ?? "",
    notes: supplier.notes ?? "",
    isActive: supplier.isActive,
    outstandingDueInPaise: supplier.outstandingDueInPaise ?? 0,
    createdAt: supplier.createdAt.toISOString(),
    updatedAt: supplier.updatedAt.toISOString(),
  };
}

export interface ListSuppliersInput {
  search?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

export async function listSuppliers(input: ListSuppliersInput = {}) {
  await ensureRequestTime();

  try {
    await connectDB();

    const filter: Record<string, unknown> = {};
    if (input.isActive !== undefined) {
      filter.isActive = input.isActive;
    }

    const term = normalizeSearchTerm(input.search);
    if (term) {
      const pattern = buildContainsRegExp(term);
      filter.$or = [
        { name: pattern },
        { businessName: pattern },
        { contactPerson: pattern },
        { phone: pattern },
        { email: pattern },
        { gstin: pattern },
      ];
    }

    const page = Math.max(1, input.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 50));

    const [rows, total] = await Promise.all([
      Supplier.find(filter)
        .sort({ name: 1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize),
      Supplier.countDocuments(filter),
    ]);

    return {
      suppliers: rows.map(toSupplierView),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  } catch (error) {
    throw toDatabaseError(error);
  }
}

export async function getSupplierById(id: string): Promise<SupplierView | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  await ensureRequestTime();

  try {
    await connectDB();
    const supplier = await Supplier.findById(id);
    return supplier ? toSupplierView(supplier) : null;
  } catch (error) {
    throw toDatabaseError(error);
  }
}

export async function createSupplier(
  input: SupplierInput,
  actor: StaffView,
): Promise<SupplierView> {
  await ensureRequestTime();

  try {
    await connectDB();
    const created = await Supplier.create({
      name: input.name.trim(),
      businessName: input.businessName.trim(),
      contactPerson: input.contactPerson?.trim() ?? "",
      phone: input.phone?.trim() ?? "",
      email: input.email?.trim().toLowerCase() ?? "",
      ...(input.address ? { address: input.address } : {}),
      gstin: input.gstin?.trim().toUpperCase() ?? "",
      notes: input.notes?.trim() ?? "",
      isActive: true,
      outstandingDueInPaise: 0,
    });

    await recordAudit({
      actorStaffId: actor.id,
      actorRole: actor.role,
      action: AUDIT_ACTION.SUPPLIER_CREATED,
      resource: "Supplier",
      resourceId: String(created._id),
      metadata: { name: created.name, businessName: created.businessName },
    });

    return toSupplierView(created);
  } catch (error) {
    throw toDatabaseError(error);
  }
}

export async function updateSupplier(
  id: string,
  input: Partial<SupplierInput> & { isActive?: boolean },
  actor: StaffView,
): Promise<SupplierView> {
  if (!Types.ObjectId.isValid(id)) throw new NotFoundError("Supplier not found.");
  await ensureRequestTime();

  try {
    await connectDB();
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name.trim();
    if (input.businessName !== undefined) patch.businessName = input.businessName.trim();
    if (input.contactPerson !== undefined) patch.contactPerson = input.contactPerson.trim();
    if (input.phone !== undefined) patch.phone = input.phone.trim();
    if (input.email !== undefined) patch.email = input.email.trim().toLowerCase();
    if (input.address !== undefined) patch.address = input.address;
    if (input.gstin !== undefined) patch.gstin = input.gstin.trim().toUpperCase();
    if (input.notes !== undefined) patch.notes = input.notes.trim();
    if (input.isActive !== undefined) patch.isActive = input.isActive;

    const updated = await Supplier.findByIdAndUpdate(
      id,
      { $set: patch },
      { returnDocument: "after", runValidators: true },
    );
    if (!updated) throw new NotFoundError("Supplier not found.");

    await recordAudit({
      actorStaffId: actor.id,
      actorRole: actor.role,
      action: AUDIT_ACTION.SUPPLIER_UPDATED,
      resource: "Supplier",
      resourceId: id,
      metadata: { changed: Object.keys(patch) },
    });

    return toSupplierView(updated);
  } catch (error) {
    throw toDatabaseError(error);
  }
}
