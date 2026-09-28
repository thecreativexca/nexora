/**
 * Development seed for customer accounts and order history.
 *
 * Usage:
 *   npm run seed:accounts            # upserts the demo customer + demo orders
 *   npm run seed:accounts -- --reset # removes the demo data first, then re-seeds
 *
 * This is intentionally separate from `npm run seed` (catalogue only) so the
 * catalogue seed keeps its "never touches orders" guarantee. Only records owned
 * by the demo account are ever written or deleted.
 *
 * Demo credentials (development only):
 *   email:    demo@nexora.example
 *   password: Demo@12345
 */
import bcrypt from "bcryptjs";
import { Types } from "mongoose";

import { BCRYPT_ROUNDS } from "@/lib/constants/customer";
import {
  ORDER_CHANNEL,
  ORDER_STATUS,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
} from "@/lib/constants/order";
import { connectDB, disconnectDB } from "@/lib/db/mongodb";
import { Customer } from "@/models/Customer";
import { CustomerSession } from "@/models/CustomerSession";
import { Order, type OrderItemSnapshot } from "@/models/Order";
import { Product } from "@/models/Product";
import { loadEnvFiles } from "@/scripts/load-env";

const DEMO_EMAIL = "demo@nexora.example";
const DEMO_PASSWORD = "Demo@12345";

const DEMO_ADDRESS = {
  line1: "221B Nexora Lane",
  line2: "Indiranagar",
  city: "Bengaluru",
  state: "Karnataka",
  postalCode: "560001",
  country: "India",
};

interface DemoOrderSpec {
  orderNumber: string;
  status: (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];
  paymentStatus: (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];
  createdAt: Date;
  notes: string;
  lines: { sku: string; quantity: number }[];
}

/** Order numbers stay stable so re-running the seed is idempotent. */
const DEMO_ORDERS: DemoOrderSpec[] = [
  {
    orderNumber: "NX-20260801-DEMA2B",
    status: ORDER_STATUS.DELIVERED,
    paymentStatus: PAYMENT_STATUS.PAID,
    createdAt: new Date("2026-08-01T10:15:00.000Z"),
    notes: "Delivered to the front desk.",
    lines: [
      { sku: "NX-ACC-APPODS2", quantity: 1 },
      { sku: "NX-ACC-PWR20W", quantity: 2 },
    ],
  },
  {
    orderNumber: "NX-20260910-DEMB3C",
    status: ORDER_STATUS.ON_THE_WAY,
    paymentStatus: PAYMENT_STATUS.PENDING,
    createdAt: new Date("2026-09-10T09:30:00.000Z"),
    notes: "Please call on arrival.",
    lines: [{ sku: "NX-TAB-IPMINI6", quantity: 1 }],
  },
  {
    orderNumber: "NX-20260918-DEMC4D",
    status: ORDER_STATUS.PREPARING,
    paymentStatus: PAYMENT_STATUS.PENDING,
    createdAt: new Date("2026-09-18T14:05:00.000Z"),
    notes: "",
    lines: [
      { sku: "NX-ACC-MAGSAFE-BP", quantity: 1 },
      { sku: "NX-ACC-CASE12-PLM", quantity: 1 },
    ],
  },
  {
    orderNumber: "NX-20260920-DEMD5E",
    status: ORDER_STATUS.ORDER_PLACED,
    paymentStatus: PAYMENT_STATUS.PENDING,
    createdAt: new Date("2026-09-20T17:45:00.000Z"),
    notes: "Gift wrap if possible.",
    lines: [{ sku: "NX-SVC-SETUP-DATA", quantity: 1 }],
  },
];

async function upsertDemoCustomer(): Promise<string> {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS);

  const customer = await Customer.findOneAndUpdate(
    { email: DEMO_EMAIL },
    {
      $set: {
        // Reset the hash each run so the documented demo credentials always work.
        passwordHash,
        name: "Demo Customer",
        phone: "9876543210",
        address: DEMO_ADDRESS,
        isActive: true,
      },
      $setOnInsert: {
        email: DEMO_EMAIL,
        lastLoginAt: null,
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );

  console.log(`[seed:accounts] customer ready: ${DEMO_EMAIL}`);
  return String(customer._id);
}

async function buildItems(spec: DemoOrderSpec): Promise<OrderItemSnapshot[]> {
  const items: OrderItemSnapshot[] = [];

  for (const line of spec.lines) {
    const product = await Product.findOne({ sku: line.sku }).lean();
    if (!product) {
      throw new Error(
        `Product with SKU ${line.sku} was not found. Run "npm run seed" first.`,
      );
    }

    items.push({
      productId: product._id as Types.ObjectId,
      productName: product.name,
      sku: product.sku,
      image: product.image ?? "",
      quantity: line.quantity,
      unitPriceInPaise: product.priceInPaise,
      lineTotalInPaise: product.priceInPaise * line.quantity,
      isService: Boolean(product.isService),
    });
  }

  return items;
}

async function upsertDemoOrders(customerId: string): Promise<void> {
  let created = 0;
  let updated = 0;

  for (const spec of DEMO_ORDERS) {
    const items = await buildItems(spec);
    const subtotalInPaise = items.reduce((total, item) => total + item.lineTotalInPaise, 0);

    const result = await Order.updateOne(
      { orderNumber: spec.orderNumber },
      {
        $set: {
          channel: ORDER_CHANNEL.ONLINE,
          status: spec.status,
          paymentMethod: PAYMENT_METHOD.PAYPAL,
          paymentStatus: spec.paymentStatus,
          customerId: new Types.ObjectId(customerId),
          customerName: "Demo Customer",
          customerEmail: DEMO_EMAIL,
          customerPhone: "9876543210",
          deliveryAddress: DEMO_ADDRESS,
          items,
          subtotalInPaise,
          discountInPaise: 0,
          taxInPaise: 0,
          totalInPaise: subtotalInPaise,
        },
        $setOnInsert: {
          orderNumber: spec.orderNumber,
          createdAt: spec.createdAt,
          updatedAt: spec.createdAt,
        },
      },
      { upsert: true, runValidators: true, timestamps: false },
    );

    if (result.upsertedCount > 0) created += 1;
    else updated += 1;
  }

  console.log(`[seed:accounts] orders: ${created} created, ${updated} updated`);
}

async function main(): Promise<void> {
  const loadedFiles = loadEnvFiles();
  console.log(`[seed:accounts] env files loaded: ${loadedFiles.join(", ") || "none"}`);

  if (!process.env.MONGODB_URI?.trim()) {
    throw new Error(
      "MONGODB_URI is not set. Copy .env.example to .env.local and add your connection string.",
    );
  }

  const shouldReset = process.argv.slice(2).includes("--reset");

  const connection = await connectDB();
  console.log(`[seed:accounts] connected to database "${connection.connection.name}"`);

  if (shouldReset) {
    const demoCustomer = await Customer.findOne({ email: DEMO_EMAIL }).select("_id").lean();
    if (demoCustomer) {
      const [deletedSessions, deletedOrders] = await Promise.all([
        CustomerSession.deleteMany({ customerId: demoCustomer._id }),
        Order.deleteMany({ customerId: demoCustomer._id }),
      ]);
      console.log(
        `[seed:accounts] reset: removed ${deletedSessions.deletedCount} sessions, ${deletedOrders.deletedCount} demo orders`,
      );
    }
    await Customer.deleteOne({ email: DEMO_EMAIL });
  }

  const customerId = await upsertDemoCustomer();
  await upsertDemoOrders(customerId);

  await Promise.all([Customer.syncIndexes(), CustomerSession.syncIndexes(), Order.syncIndexes()]);
  console.log("[seed:accounts] indexes synced for Customer, CustomerSession and Order");

  await disconnectDB();
  console.log(
    `[seed:accounts] done - sign in with ${DEMO_EMAIL} / ${DEMO_PASSWORD} (development only)`,
  );
}

main().catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[seed:accounts] failed: ${message}`);
  await disconnectDB().catch(() => undefined);
  process.exit(1);
});
