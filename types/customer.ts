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
