import type { OrderAddressSnapshot } from "@/types/order";

export type CustomerAddressView = OrderAddressSnapshot;

/**
 * Safe, serialisable customer profile.
 *
 * Never contains `passwordHash` or any session/token material - this is the
 * only customer shape that may cross the server/client boundary.
 */
export interface CustomerView {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: CustomerAddressView | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

/** Staff-safe customer row with aggregate order activity. */
export interface CustomerAdminView extends CustomerView {
  orderCount: number;
  totalSpentInPaise: number;
  lastOrderAt: string | null;
}

export interface CustomerAdminListResult {
  customers: CustomerAdminView[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
