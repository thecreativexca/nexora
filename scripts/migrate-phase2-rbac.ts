/**
 * Phase 2 RBAC Database Migration Script
 *
 * Usage:
 *   npx tsx scripts/migrate-phase2-rbac.ts
 *
 * Safely migrates existing StaffProfile documents to Phase 2 RBAC standards:
 * 1. Normalizes legacy roles:
 *    - CASHIER -> SELLER
 *    - SUPER_ADMIN -> ADMIN
 * 2. Populates empty permissionGrants and permissionDenies arrays if missing.
 * 3. Verifies active Admin presence and reports database RBAC readiness.
 * 4. Ensures indexes on StaffProfile and AuditLog collections.
 */
import { connectDB, disconnectDB } from "@/lib/db/mongodb";
import { STAFF_ROLE } from "@/lib/constants/staff";
import { StaffProfile } from "@/models/StaffProfile";
import { AuditLog } from "@/models/AuditLog";
import { loadEnvFiles } from "@/scripts/load-env";

async function runMigration() {
  loadEnvFiles();
  console.log("Connecting to database...");
  await connectDB();

  console.log("1. Inspecting staff profiles for legacy roles and missing permission arrays...");
  const allStaff = await StaffProfile.find({}).lean();
  console.log(`Found ${allStaff.length} staff records in total.`);

  let rolesUpdated = 0;
  let arraysInitialized = 0;

  for (const staff of allStaff) {
    const updates: Record<string, unknown> = {};

    // Normalize legacy CASHIER to canonical SELLER
    if ((staff.role as string) === "CASHIER") {
      updates.role = STAFF_ROLE.SELLER;
    }
    // Normalize legacy SUPER_ADMIN to canonical ADMIN
    if ((staff.role as string) === "SUPER_ADMIN") {
      updates.role = STAFF_ROLE.ADMIN;
    }

    // Initialize permission arrays if null or undefined
    if (!Array.isArray(staff.permissionGrants)) {
      updates.permissionGrants = [];
    }
    if (!Array.isArray(staff.permissionDenies)) {
      updates.permissionDenies = [];
    }

    if (Object.keys(updates).length > 0) {
      await StaffProfile.updateOne({ _id: staff._id }, { $set: updates });
      if (updates.role) rolesUpdated++;
      if (updates.permissionGrants || updates.permissionDenies) arraysInitialized++;
      console.log(`  Updated ${staff.email}: ${JSON.stringify(updates)}`);
    }
  }

  console.log(`Migration stats: ${rolesUpdated} roles updated, ${arraysInitialized} permission sets initialized.`);

  // Verify Admin existence
  const activeAdmins = await StaffProfile.countDocuments({
    role: { $in: [STAFF_ROLE.ADMIN, STAFF_ROLE.SUPER_ADMIN] },
    isActive: true,
  });

  if (activeAdmins === 0) {
    console.warn("WARNING: No active Administrator found! Please run `npm run create-super-admin` to provision an Admin.");
  } else {
    console.log(`Verified ${activeAdmins} active Administrator account(s) present.`);
  }

  console.log("2. Ensuring indexes...");
  await StaffProfile.syncIndexes();
  await AuditLog.syncIndexes();
  console.log("Indexes synchronized successfully.");

  console.log("Phase 2 RBAC migration completed successfully.");
}

runMigration()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDB();
  });
