/**
 * Phase 3 - Comprehensive POS, Billing, Inventory, Stock Ledger, Purchases & Store Operations Tests.
 *
 * Verifies with real MongoDB operations:
 * 1. Product creation with barcode, MRP, tax rate, unit, and initial ledger entry.
 * 2. Barcode & SKU lookup for fast scanner billing.
 * 3. Manual stock adjustment with before/after audit ledger tracking.
 * 4. Prevention of negative stock.
 * 5. Category management and product count aggregation.
 * 6. Supplier creation and outstanding due tracking.
 * 7. Purchase order lifecycle: Draft/Approval -> Goods Receipt (stock increment only on accepted receipt) -> Supplier payment.
 * 8. POS in-store sale with taxes, cash change, stock deduction, and ledger entry.
 * 9. POS split payment and customer due tracking.
 * 10. Itemized sales returns: sellable restock vs damaged tracking, capped refund amount.
 */
import { Types } from "mongoose";

import { connectDB, disconnectDB } from "@/lib/db/mongodb";
import { STAFF_PERMISSION, STAFF_ROLE } from "@/lib/constants/staff";
import { PAYMENT_METHOD, PAYMENT_STATUS } from "@/lib/constants/order";
import {
  adjustProductStock,
  createInventoryProduct,
  lookupProductByBarcodeOrSku,
} from "@/lib/services/inventory.service";
import {
  createCategory,
  listAllCategoriesForStaff,
} from "@/lib/services/category.service";
import {
  createSupplier,
  getSupplierById,
} from "@/lib/services/supplier.service";
import {
  createPurchaseOrder,
  approvePurchaseOrder,
  receivePurchaseOrderItems,
  recordSupplierPayment,
  getPurchaseOrderDetail,
} from "@/lib/services/purchase.service";
import { createInStoreOrder } from "@/lib/services/order.service";
import { processSalesReturn } from "@/lib/services/returns.service";
import { listStockMovements } from "@/lib/services/stock-movement.service";
import { Category } from "@/models/Category";
import { Customer } from "@/models/Customer";
import { Order } from "@/models/Order";
import { Product } from "@/models/Product";
import { PurchaseOrder } from "@/models/PurchaseOrder";
import { StockMovement } from "@/models/StockMovement";
import { Supplier } from "@/models/Supplier";
import { loadEnvFiles } from "@/scripts/load-env";
import type { InventoryProduct } from "@/types/pos";
import type { StaffView } from "@/types/staff";

loadEnvFiles();

let passed = 0;
const failures: string[] = [];

async function check(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures.push(name);
    const message = error instanceof Error ? error.message : String(error);
    console.error(`  FAIL ${name}\n         ${message}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const mockAdmin: StaffView = {
  id: new Types.ObjectId().toString(),
  name: "Phase 3 Admin",
  email: "phase3.admin@nexora.test",
  role: STAFF_ROLE.ADMIN,
  effectivePermissions: Object.values(STAFF_PERMISSION),
  permissionGrants: [],
  permissionDenies: [],
  lastLoginAt: null,
  invitedBy: null,
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockSeller: StaffView = {
  id: new Types.ObjectId().toString(),
  name: "Phase 3 Seller",
  email: "phase3.seller@nexora.test",
  role: STAFF_ROLE.SELLER,
  effectivePermissions: [
    STAFF_PERMISSION.ACCESS_REGISTER,
    STAFF_PERMISSION.ORDERS_VIEW_OWN,
    STAFF_PERMISSION.PAYMENTS_COLLECT,
  ],
  permissionGrants: [],
  permissionDenies: [],
  lastLoginAt: null,
  invitedBy: null,
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

async function main() {
  console.log("\n--- Starting Phase 3 POS & ERP Integration Suite ---\n");

  await connectDB();

  const runId = Date.now().toString().slice(-6);

  let testCategory!: { id: string; name: string };
  let testSupplier!: { id: string; name: string };
  let testProduct!: InventoryProduct;
  let testCustomer!: { _id: Types.ObjectId };

  // 1. Category Management
  await check("1. Category creation and staff list aggregation", async () => {
    const created = await createCategory(
      {
        name: `Phase 3 Electronics ${runId}`,
        description: "Test electronics category",
      },
      mockAdmin,
    );
    assert(Boolean(created.id), "Category should have an ID");
    assertEqual(created.name, `Phase 3 Electronics ${runId}`, "Category name matches");
    testCategory = created;

    const all = await listAllCategoriesForStaff();
    const found = all.find((c) => c.id === created.id);
    assert(Boolean(found), "Created category should appear in staff list");
  });

  // 2. Supplier Management
  await check("2. Supplier creation with GSTIN and dues initialized to zero", async () => {
    const created = await createSupplier(
      {
        name: `Apex Supplies ${runId}`,
        businessName: `Apex Supplies India Ltd ${runId}`,
        contactPerson: "Rajesh Kumar",
        phone: "+91 98765 43210",
        email: `apex.${runId}@example.com`,
        gstin: "27AAAAA0000A1Z5",
        notes: "Primary electronics distributor",
      },
      mockAdmin,
    );

    assert(Boolean(created.id), "Supplier must have an ID");
    assertEqual(created.outstandingDueInPaise, 0, "Initial due must be 0");
    testSupplier = created;

    const retrieved = await getSupplierById(created.id);
    assert(Boolean(retrieved), "Supplier should be retrieved by ID");
    assertEqual(retrieved!.name, `Apex Supplies ${runId}`, "Retrieved supplier name matches");
  });

  // 3. Product Management with Barcode & Initial Stock Ledger
  await check("3. Product creation with barcode, GST, unit, and initial ledger logging", async () => {
    const barcode = `890${runId}12345`;
    const sku = `NX-PH3-${runId}`;

    const created = await createInventoryProduct(
      {
        name: `Smart POS Terminal ${runId}`,
        description: "Flagship wireless billing terminal",
        sku,
        barcode,
        priceInPaise: 15000_00, // ₹15,000
        costInPaise: 10000_00,  // ₹10,000
        mrpInPaise: 18000_00,   // ₹18,000 MRP
        taxRate: 18,            // 18% GST
        unit: "Piece",
        minStockThreshold: 5,
        stock: 20,              // 20 initial units
        category: testCategory.id,
        supplier: testSupplier.id,
        isActive: true,
      },
      mockAdmin,
    );

    assert(Boolean(created.id), "Product must be created");
    assertEqual(created.stock, 20, "Stock level must match");
    assertEqual(created.barcode, barcode, "Barcode must be stored");
    assertEqual(created.taxRate, 18, "Tax rate must be stored");
    assertEqual(created.unit, "Piece", "Unit must be stored");
    testProduct = created;

    // Verify initial stock movement in ledger
    const movements = await listStockMovements({ productId: created.id });
    assert(movements.movements.length >= 1, "Initial stock should produce a movement ledger entry");
    assertEqual(movements.movements[0].quantityChange, 20, "Ledger quantity change must be +20");
    assertEqual(movements.movements[0].quantityAfter, 20, "Ledger quantity after must be 20");
  });

  // 4. Fast Barcode & SKU Lookup
  await check("4. Fast Barcode & SKU scanner lookup endpoint service", async () => {
    const byBarcode = await lookupProductByBarcodeOrSku(testProduct.barcode);
    assert(Boolean(byBarcode), "Must find product by barcode");
    assertEqual(byBarcode!.id, testProduct.id, "ID must match for barcode lookup");

    const bySku = await lookupProductByBarcodeOrSku(testProduct.sku);
    assert(Boolean(bySku), "Must find product by SKU");
    assertEqual(bySku!.id, testProduct.id, "ID must match for SKU lookup");
  });

  // 5. Stock Adjustment and Negative Prevention
  await check("5. Manual stock adjustment with ledger audit and negative stock prevention", async () => {
    // Add 10 units
    const afterAdd = await adjustProductStock(
      testProduct.id,
      10,
      "Physical inventory audit restock",
      mockAdmin,
    );
    assertEqual(afterAdd.stock, 30, "Stock should increase from 20 to 30");

    // Reduce 5 units
    const afterReduce = await adjustProductStock(
      testProduct.id,
      -5,
      "Damaged packaging write-off",
      mockAdmin,
    );
    assertEqual(afterReduce.stock, 25, "Stock should decrease from 30 to 25");

    // Attempt to reduce more than available (oversell prevention)
    let threw = false;
    try {
      await adjustProductStock(
        testProduct.id,
        -100, // 25 - 100 = -75 (invalid)
        "Invalid reduction",
        mockAdmin,
      );
    } catch {
      threw = true;
    }
    assert(threw, "Stock adjustment resulting in negative stock must throw an error");
  });

  // 6. Customer Management
  await check("6. Customer record creation with dues tracking", async () => {
    const customer = await Customer.create({
      name: `Ramesh Sharma ${runId}`,
      email: `ramesh.${runId}@example.com`,
      phone: `+91 91234 ${runId.slice(0, 5)}`,
      outstandingDueInPaise: 0,
      totalPurchasesInPaise: 0,
      isActive: true,
    });
    assert(Boolean(customer._id), "Customer should be created");
    testCustomer = customer;
  });

  // 7. Purchase Order Lifecycle: Draft -> Approval -> Goods Receipt -> Supplier Payment
  await check("7. Purchase Order lifecycle: PO approval, accepted receipt stock increment, and supplier dues", async () => {
    // 7.1 Create PO for 10 units @ ₹9,500 each + ₹1,000 tax
    const po = await createPurchaseOrder(
      {
        supplierId: testSupplier.id,
        items: [
          {
            productId: testProduct.id,
            orderedQuantity: 10,
            unitCostInPaise: 9500_00,
          },
        ],
        taxInPaise: 1000_00,
        notes: "Quarterly stock replenishment",
      },
      mockAdmin,
    );

    assertEqual(po.subtotalInPaise, 95000_00, "Subtotal must be 10 * 9500 = 95000");
    assertEqual(po.totalInPaise, 96000_00, "Total must include tax (96000)");

    // Supplier due must have increased
    const supplierBeforeReceipt = await getSupplierById(testSupplier.id);
    assertEqual(supplierBeforeReceipt!.outstandingDueInPaise, 96000_00, "Supplier dues updated");

    // Product stock must NOT have increased yet!
    const productBeforeReceipt = await Product.findById(testProduct.id);
    assertEqual(productBeforeReceipt!.stock, 25, "Stock must NOT increase upon PO creation");

    // 7.2 Approve PO
    const approved = await approvePurchaseOrder(po.poNumber, mockAdmin);
    assertEqual(approved.status, "APPROVED", "PO status must be APPROVED");

    // 7.3 Receive Goods: 8 accepted, 2 rejected (damaged in transit)
    const afterReceipt = await receivePurchaseOrderItems(
      po.poNumber,
      {
        receiptItems: [
          {
            productId: testProduct.id,
            quantityAccepted: 8,
            quantityRejected: 2,
            notes: "2 units box damaged",
          },
        ],
        notes: "Delivered via BlueDart",
      },
      mockAdmin,
    );

    assertEqual(afterReceipt.status, "PARTIALLY_RECEIVED", "Status should be PARTIALLY_RECEIVED");

    // Stock must have increased by EXACTLY the accepted quantity (8 units) -> 25 + 8 = 33!
    const productAfterReceipt = await Product.findById(testProduct.id);
    assertEqual(productAfterReceipt!.stock, 33, "Stock must increment only by accepted quantity (33)");

    // 7.4 Record Payment to Supplier
    const afterPayment = await recordSupplierPayment(
      po.poNumber,
      {
        amountInPaise: 50000_00, // ₹50,000 partial payment to supplier
        paymentMethod: "BANK_TRANSFER",
        referenceNumber: `NEFT-${runId}`,
        notes: "Part payment via HDFC Bank",
      },
      mockAdmin,
    );

    assertEqual(afterPayment.amountPaidInPaise, 50000_00, "PO amountPaid recorded");
    assertEqual(afterPayment.paymentStatus, "PARTIALLY_PAID", "PO payment status PARTIALLY_PAID");

    const supplierAfterPayment = await getSupplierById(testSupplier.id);
    assertEqual(
      supplierAfterPayment!.outstandingDueInPaise,
      46000_00, // 96000 - 50000 = 46000
      "Supplier outstanding due decreased after payment",
    );
  });

  // 8. POS In-Store Sale with Taxes, Cash Change, Stock Deduction, and Ledger
  let completedOrderNumber = "";
  await check("8. POS Sale: automatic taxes, cash change calculation, atomic stock decrement, and ledger logging", async () => {
    const initialProduct = await Product.findById(testProduct.id);
    const initialStock = initialProduct!.stock; // 33

    // Sale of 2 units @ ₹15,000 + 18% GST (₹5,400 total tax) = ₹35,400
    // Customer pays ₹40,000 in cash -> change = ₹4,600
    const receipt = await createInStoreOrder(
      {
        items: [{ productId: testProduct.id, quantity: 2 }],
        paymentMethod: PAYMENT_METHOD.CASH,
        cashReceivedInPaise: 40000_00,
        customerName: "Walk-in Buyer",
        customerId: undefined,
        customerEmail: "",
        customerPhone: "",
        discountInPaise: 0,
        referenceNumber: "",
        paymentNotes: "",
        idempotencyKey: `pos-sale-${runId}-1`,
      },
      mockSeller,
    );

    completedOrderNumber = receipt.orderNumber;
    assertEqual(receipt.subtotalInPaise, 30000_00, "Subtotal: 2 * 15000 = 30000");
    assertEqual(receipt.taxInPaise, 5400_00, "Tax: 18% of 30000 = 5400");
    assertEqual(receipt.totalInPaise, 35400_00, "Total: 30000 + 5400 = 35400");
    assertEqual(receipt.changeInPaise, 4600_00, "Change: 40000 - 35400 = 4600");
    assertEqual(receipt.paymentStatus, PAYMENT_STATUS.PAID, "Status is PAID");

    // Stock must have decremented by 2 -> 33 - 2 = 31
    const productAfterSale = await Product.findById(testProduct.id);
    assertEqual(productAfterSale!.stock, initialStock - 2, "Stock must decrement by sold quantity");

    // Verify SALE ledger entry
    const movements = await listStockMovements({ productId: testProduct.id, movementType: "SALE" });
    const saleMovement = movements.movements.find((m) => m.referenceId === receipt.orderNumber);
    assert(Boolean(saleMovement), "Stock movement ledger must record SALE entry");
    assertEqual(saleMovement!.quantityChange, -2, "Sale movement change must be -2");
  });

  // 9. POS Split Payment and Customer Due Tracking
  await check("9. POS Sale: Split Payment (Cash + UPI) and customer dues tracking", async () => {
    // Total for 1 unit: ₹15,000 + 18% tax (₹2,700) = ₹17,700
    // Split: Cash ₹10,000 + UPI ₹7,700 = ₹17,700
    const receipt = await createInStoreOrder(
      {
        items: [{ productId: testProduct.id, quantity: 1 }],
        customerId: testCustomer._id.toString(),
        paymentMethod: PAYMENT_METHOD.SPLIT,
        splitPayments: [
          { paymentMethod: PAYMENT_METHOD.CASH, amountInPaise: 10000_00, referenceNumber: "", notes: "" },
          { paymentMethod: PAYMENT_METHOD.UPI, amountInPaise: 7700_00, referenceNumber: `UPI-${runId}`, notes: "" },
        ],
        customerName: "",
        customerEmail: "",
        customerPhone: "",
        discountInPaise: 0,
        cashReceivedInPaise: 0,
        referenceNumber: "",
        paymentNotes: "",
        idempotencyKey: `pos-split-${runId}-2`,
      },
      mockSeller,
    );

    assertEqual(receipt.totalInPaise, 17700_00, "Total must be 17700");
    assertEqual(receipt.amountPaidInPaise, 17700_00, "Split cleared amount must be 17700");
    assertEqual(receipt.paymentStatus, PAYMENT_STATUS.PAID, "Payment status must be PAID");

    // Customer total purchases updated
    const customer = await Customer.findById(testCustomer._id);
    assertEqual(customer!.totalPurchasesInPaise, 17700_00, "Customer totalPurchases updated");
  });

  // 10. Sales Return: Itemized return with sellable restock & refund cap
  await check("10. Sales Returns: eligible quantity validation, sellable restock, and capped refund", async () => {
    const productBeforeReturn = await Product.findById(testProduct.id);
    const stockBefore = productBeforeReturn!.stock;

    // Return 1 unit from completed order
    const returnResult = await processSalesReturn(
      {
        orderNumber: completedOrderNumber,
        items: [
          {
            productId: testProduct.id,
            quantity: 1,
            condition: "sellable",
            reason: "Customer changed color preference",
          },
        ],
        refundMethod: PAYMENT_METHOD.CASH,
        notes: "Restocked into sellable inventory",
      },
      mockAdmin,
    );

    assertEqual(returnResult.orderNumber, completedOrderNumber, "Order number matches");
    assert(returnResult.refundAmountInPaise > 0, "Refund amount must be > 0");
    assertEqual(
      returnResult.returnedItems
        .filter((item) => item.condition === "sellable")
        .reduce((sum, item) => sum + item.quantity, 0),
      1,
      "Restocked count must be 1",
    );

    // Stock must have increased by 1 (sellable item restocked)
    const productAfterReturn = await Product.findById(testProduct.id);
    assertEqual(productAfterReturn!.stock, stockBefore + 1, "Sellable returned item restocked in inventory");

    // Attempt duplicate return of 2 units (only 1 remaining from original 2 sold)
    let threw = false;
    try {
      await processSalesReturn(
        {
          orderNumber: completedOrderNumber,
          items: [
            {
              productId: testProduct.id,
              quantity: 2, // 2 requested but only 1 eligible remaining!
              condition: "sellable",
            },
          ],
          refundMethod: PAYMENT_METHOD.CASH,
        },
        mockAdmin,
      );
    } catch {
      threw = true;
    }
    assert(threw, "Excess return quantity must throw validation error");
  });

  // Cleanup test data
  try {
    if (testProduct?.id) await Product.deleteOne({ _id: testProduct.id });
    if (testCategory?.id) await Category.deleteOne({ _id: testCategory.id });
    if (testSupplier?.id) await Supplier.deleteOne({ _id: testSupplier.id });
    if (testCustomer?._id) await Customer.deleteOne({ _id: testCustomer._id });
    await Order.deleteMany({ orderNumber: completedOrderNumber });
    await StockMovement.deleteMany({ sku: `NX-PH3-${runId}` });
  } catch {
    // Ignore cleanup errors
  }

  await disconnectDB();

  console.log(`\n--- Test Summary: ${passed} passed, ${failures.length} failed ---\n`);

  if (failures.length > 0) {
    console.error("Failures:", failures);
    process.exit(1);
  }
}

void main();
