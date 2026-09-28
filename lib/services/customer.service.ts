import "server-only";

import { Types } from "mongoose";

import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { connectDB } from "@/lib/db/mongodb";
import { ensureRequestTime } from "@/lib/db/request-time";
import { ORDER_STATUS } from "@/lib/constants/order";
import { toDatabaseError } from "@/lib/services/service-errors";
import {
  AccountDisabledError,
  CustomerCreationFailedError,
  EmailTakenError,
  InvalidCredentialsError,
  ProfileUpdateFailedError,
  NotFoundError,
  isAppError,
  isDuplicateKeyError,
} from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";
import { normalizeEmail, normalizePhone } from "@/lib/validations/common";
import { Customer, type CustomerAddress } from "@/models/Customer";
import { Order } from "@/models/Order";
import { buildContainsRegExp, normalizeSearchTerm } from "@/lib/utils/search";
import type {
  CustomerAdminListResult,
  CustomerAdminView,
  CustomerView,
} from "@/types/customer";

interface LeanCustomer {
  _id: Types.ObjectId;
  email: string;
  name: string;
  phone?: string;
  address?: CustomerAddress | null;
  isActive?: boolean;
  lastLoginAt?: Date | null;
  createdAt: Date;
}

interface LeanCustomerWithHash extends LeanCustomer {
  passwordHash?: string;
}

export interface CustomerRegistrationPayload {
  name: string;
  email: string;
  password: string;
  phone: string;
}

export interface CustomerProfilePayload {
  name: string;
  phone: string;
  address?: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
}

/** Only ever returns fields that are safe to send to the browser. */
export function toCustomerView(customer: LeanCustomer): CustomerView {
  return {
    id: String(customer._id),
    name: customer.name,
    email: customer.email,
    phone: customer.phone ?? "",
    address: customer.address
      ? {
          line1: customer.address.line1,
          line2: customer.address.line2 ?? "",
          city: customer.address.city,
          state: customer.address.state,
          postalCode: customer.address.postalCode,
          country: customer.address.country,
        }
      : null,
    isActive: customer.isActive !== false,
    lastLoginAt: customer.lastLoginAt ? new Date(customer.lastLoginAt).toISOString() : null,
    createdAt: new Date(customer.createdAt).toISOString(),
  };
}

async function ensureDatabase(): Promise<void> {
  await ensureRequestTime();
  try {
    await connectDB();
  } catch (error) {
    throw toDatabaseError(error);
  }
}

/** Creates a new account. Duplicate emails fail safely with a 409. */
export async function registerCustomer(
  input: CustomerRegistrationPayload,
): Promise<CustomerView> {
  await ensureDatabase();

  const email = normalizeEmail(input.email);
  const phone = input.phone ? normalizePhone(input.phone) : "";

  try {
    const existing = await Customer.findOne({ email }).select("_id").lean<{ _id: Types.ObjectId } | null>();
    if (existing) throw new EmailTakenError();

    const passwordHash = await hashPassword(input.password);

    const created = await Customer.create({
      email,
      passwordHash,
      name: input.name.trim(),
      phone,
      address: null,
      isActive: true,
      lastLoginAt: new Date(),
    });

    logger.info("Customer registered", { customerId: String(created._id) });
    return toCustomerView(created.toObject() as unknown as LeanCustomer);
  } catch (error) {
    if (isAppError(error)) throw error;
    if (isDuplicateKeyError(error)) throw new EmailTakenError();
    logger.error("Customer registration failed", error);
    throw new CustomerCreationFailedError(undefined, error);
  }
}

/**
 * Verifies credentials without revealing whether the email exists.
 * A disabled account is only reported after the password is proven correct.
 */
export async function authenticateCustomer(
  emailInput: string,
  password: string,
): Promise<CustomerView> {
  await ensureDatabase();

  const email = normalizeEmail(emailInput);

  let customer: LeanCustomerWithHash | null;
  try {
    customer = await Customer.findOne({ email })
      .select("+passwordHash")
      .lean<LeanCustomerWithHash | null>();
  } catch (error) {
    throw toDatabaseError(error);
  }

  if (!customer) throw new InvalidCredentialsError();

  const passwordMatches = await verifyPassword(password, customer.passwordHash ?? "");
  if (!passwordMatches) throw new InvalidCredentialsError();

  if (customer.isActive === false) throw new AccountDisabledError();

  try {
    const updated = await Customer.findByIdAndUpdate(
      customer._id,
      { $set: { lastLoginAt: new Date() } },
      { new: true },
    ).lean<LeanCustomer | null>();
    return toCustomerView(updated ?? customer);
  } catch (error) {
    logger.error("Updating lastLoginAt failed", error);
    // Sign-in still succeeds; a stale timestamp must not block the customer.
    return toCustomerView(customer);
  }
}

export async function getCustomerById(id: string): Promise<CustomerView | null> {
  if (!Types.ObjectId.isValid(id)) return null;

  await ensureDatabase();

  try {
    const customer = await Customer.findById(id).lean<LeanCustomer | null>();
    return customer ? toCustomerView(customer) : null;
  } catch (error) {
    throw toDatabaseError(error);
  }
}

/** Whitelisted profile update - the request body is never spread into Mongo. */
export async function updateCustomerProfile(
  customerId: string,
  input: CustomerProfilePayload,
): Promise<CustomerView> {
  if (!Types.ObjectId.isValid(customerId)) {
    throw new ProfileUpdateFailedError("We could not find your account.");
  }

  await ensureDatabase();

  const update: Record<string, unknown> = {
    name: input.name.trim(),
    phone: input.phone ? normalizePhone(input.phone) : "",
    address: input.address
      ? {
          line1: input.address.line1,
          line2: input.address.line2 ?? "",
          city: input.address.city,
          state: input.address.state,
          postalCode: input.address.postalCode,
          country: input.address.country,
        }
      : null,
  };

  try {
    const updated = await Customer.findByIdAndUpdate(
      customerId,
      { $set: update },
      { new: true, runValidators: true },
    ).lean<LeanCustomer | null>();

    if (!updated) throw new ProfileUpdateFailedError("We could not find your account.");
    return toCustomerView(updated);
  } catch (error) {
    if (isAppError(error)) throw error;
    logger.error("Customer profile update failed", error);
    throw new ProfileUpdateFailedError(undefined, error);
  }
}

const CUSTOMER_DIRECTORY_PAGE_SIZE = 20;

/**
 * Staff customer directory with server-side search and compact order totals.
 * Password hashes, OAuth identities and session data never enter this query.
 */
export async function listCustomersForStaff(input: {
  search?: string;
  status?: "all" | "active" | "inactive";
  page?: number;
} = {}): Promise<CustomerAdminListResult> {
  await ensureDatabase();

  const search = normalizeSearchTerm(input.search);
  const status = input.status ?? "all";
  const page = Math.max(1, Math.min(1000, Math.trunc(input.page ?? 1)));
  const filter: Record<string, unknown> = {};

  if (search) {
    const matcher = buildContainsRegExp(search);
    filter.$or = [{ name: matcher }, { email: matcher }, { phone: matcher }];
  }
  if (status === "active") filter.isActive = { $ne: false };
  if (status === "inactive") filter.isActive = false;

  try {
    const total = await Customer.countDocuments(filter);
    const totalPages = Math.max(1, Math.ceil(total / CUSTOMER_DIRECTORY_PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const customers = await Customer.find(filter)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * CUSTOMER_DIRECTORY_PAGE_SIZE)
      .limit(CUSTOMER_DIRECTORY_PAGE_SIZE)
      .lean<LeanCustomer[]>();

    const ids = customers.map((customer) => customer._id);
    const orderStats = ids.length === 0
      ? []
      : await Order.aggregate<{
          _id: Types.ObjectId;
          orderCount: number;
          totalSpentInPaise: number;
          lastOrderAt: Date | null;
        }>([
          {
            $match: {
              customerId: { $in: ids },
              status: { $nin: [ORDER_STATUS.CANCELLED, ORDER_STATUS.REFUNDED] },
            },
          },
          {
            $group: {
              _id: "$customerId",
              orderCount: { $sum: 1 },
              totalSpentInPaise: { $sum: "$totalInPaise" },
              lastOrderAt: { $max: "$createdAt" },
            },
          },
        ]);
    const statsByCustomer = new Map(orderStats.map((row) => [String(row._id), row]));

    const views: CustomerAdminView[] = customers.map((customer) => {
      const stats = statsByCustomer.get(String(customer._id));
      return {
        ...toCustomerView(customer),
        orderCount: stats?.orderCount ?? 0,
        totalSpentInPaise: stats?.totalSpentInPaise ?? 0,
        lastOrderAt: stats?.lastOrderAt ? new Date(stats.lastOrderAt).toISOString() : null,
      };
    });

    return {
      customers: views,
      total,
      page: safePage,
      pageSize: CUSTOMER_DIRECTORY_PAGE_SIZE,
      totalPages,
    };
  } catch (error) {
    throw toDatabaseError(error);
  }
}

/** Manager/Admin customer-access control. Existing sessions stop resolving immediately. */
export async function setCustomerActive(
  customerId: string,
  isActive: boolean,
): Promise<CustomerView> {
  if (!Types.ObjectId.isValid(customerId)) {
    throw new NotFoundError("That customer account could not be found.");
  }

  await ensureDatabase();
  try {
    const customer = await Customer.findByIdAndUpdate(
      customerId,
      { $set: { isActive } },
      { new: true, runValidators: true },
    ).lean<LeanCustomer | null>();
    if (!customer) throw new NotFoundError("That customer account could not be found.");
    return toCustomerView(customer);
  } catch (error) {
    if (isAppError(error)) throw error;
    throw toDatabaseError(error);
  }
}
