/**
 * MongoDB seed script for the Nexora catalogue.
 *
 * Usage:
 *   npm run seed          # idempotent upsert of categories + products
 *   npm run seed:reset    # deletes catalogue collections first, then re-seeds
 *
 * Safety:
 * - Never touches the `orders` collection.
 * - Upserts by unique slug/SKU, so running it twice does not duplicate data.
 * - Validates the seed data (duplicate slugs/SKUs, unknown categories) before
 *   writing anything, and exits non-zero with a clear message on failure.
 * - Syncs schema indexes afterwards (run against development/staging only).
 */
import { connectDB, disconnectDB } from "@/lib/db/mongodb";
import { Category } from "@/models/Category";
import { Order } from "@/models/Order";
import { Product } from "@/models/Product";
import { loadEnvFiles } from "@/scripts/load-env";
import { SEED_CATEGORIES, SEED_PRODUCTS } from "@/scripts/seed-data";

const shouldReset = process.argv.slice(2).includes("--reset");

function validateSeedData(): void {
  const problems: string[] = [];
  const categorySlugs = new Set<string>();

  for (const category of SEED_CATEGORIES) {
    if (categorySlugs.has(category.slug)) problems.push(`Duplicate category slug: ${category.slug}`);
    categorySlugs.add(category.slug);
  }

  const productSlugs = new Set<string>();
  const productSkus = new Set<string>();

  for (const product of SEED_PRODUCTS) {
    if (productSlugs.has(product.slug)) problems.push(`Duplicate product slug: ${product.slug}`);
    if (productSkus.has(product.sku)) problems.push(`Duplicate product SKU: ${product.sku}`);
    if (!categorySlugs.has(product.categorySlug)) {
      problems.push(`Product ${product.slug} references unknown category ${product.categorySlug}`);
    }
    if (!Number.isSafeInteger(product.priceInPaise) || product.priceInPaise < 0) {
      problems.push(`Product ${product.slug} has an invalid price`);
    }
    if (!Number.isInteger(product.stock) || product.stock < 0) {
      problems.push(`Product ${product.slug} has an invalid stock value`);
    }
    productSlugs.add(product.slug);
    productSkus.add(product.sku);
  }

  if (problems.length > 0) {
    throw new Error(`Seed data is invalid:\n  - ${problems.join("\n  - ")}`);
  }
}

async function seedCategories(): Promise<Map<string, string>> {
  const categoryIdBySlug = new Map<string, string>();

  for (const category of SEED_CATEGORIES) {
    const document = await Category.findOneAndUpdate(
      { slug: category.slug },
      {
        $set: {
          name: category.name,
          description: category.description,
          image: category.image,
          isActive: category.isActive,
        },
        $setOnInsert: { slug: category.slug },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    );

    categoryIdBySlug.set(category.slug, String(document._id));
  }

  console.log(`[seed] categories upserted: ${categoryIdBySlug.size}`);
  return categoryIdBySlug;
}

async function seedProducts(categoryIdBySlug: Map<string, string>): Promise<void> {
  let created = 0;
  let updated = 0;

  for (const product of SEED_PRODUCTS) {
    const categoryId = categoryIdBySlug.get(product.categorySlug);
    if (!categoryId) {
      throw new Error(`Missing category id for slug ${product.categorySlug}`);
    }

    const result = await Product.updateOne(
      { slug: product.slug },
      {
        $set: {
          name: product.name,
          description: product.description,
          sku: product.sku,
          priceInPaise: product.priceInPaise,
          costInPaise: product.costInPaise,
          stock: product.stock,
          category: categoryId,
          image: product.image,
          images: product.image ? [product.image] : [],
          isFeatured: product.isFeatured,
          isActive: product.isActive,
          isService: product.isService,
        },
        $setOnInsert: { slug: product.slug },
      },
      { upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );

    if (result.upsertedCount > 0) created += 1;
    else updated += 1;
  }

  console.log(`[seed] products: ${created} created, ${updated} updated`);
}

async function reportSummary(): Promise<void> {
  const [totalProducts, activeProducts, featured, services, outOfStock, inactive] =
    await Promise.all([
      Product.countDocuments({}),
      Product.countDocuments({ isActive: true }),
      Product.countDocuments({ isActive: true, isFeatured: true }),
      Product.countDocuments({ isActive: true, isService: true }),
      Product.countDocuments({ isActive: true, isService: false, stock: 0 }),
      Product.countDocuments({ isActive: false }),
    ]);

  console.log(
    [
      "[seed] summary",
      `  products total  : ${totalProducts}`,
      `  public (active) : ${activeProducts}`,
      `  featured        : ${featured}`,
      `  services        : ${services}`,
      `  out of stock    : ${outOfStock}`,
      `  inactive        : ${inactive}`,
    ].join("\n"),
  );
}

async function main(): Promise<void> {
  const loadedFiles = loadEnvFiles();
  console.log(`[seed] env files loaded: ${loadedFiles.join(", ") || "none"}`);

  if (!process.env.MONGODB_URI?.trim()) {
    throw new Error(
      "MONGODB_URI is not set. Copy .env.example to .env.local and add your connection string.",
    );
  }

  validateSeedData();
  console.log(
    `[seed] seed data validated: ${SEED_CATEGORIES.length} categories, ${SEED_PRODUCTS.length} products`,
  );

  const connection = await connectDB();
  console.log(`[seed] connected to database "${connection.connection.name}"`);

  if (shouldReset) {
    const [deletedCategories, deletedProducts] = await Promise.all([
      Category.deleteMany({}),
      Product.deleteMany({}),
    ]);
    console.log(
      `[seed] reset: removed ${deletedCategories.deletedCount} categories, ${deletedProducts.deletedCount} products (orders untouched)`,
    );
  }

  const categoryIdBySlug = await seedCategories();
  await seedProducts(categoryIdBySlug);

  await Promise.all([Category.syncIndexes(), Product.syncIndexes(), Order.syncIndexes()]);
  console.log("[seed] indexes synced for Category, Product and Order");

  await reportSummary();
  await disconnectDB();
  console.log("[seed] done");
}

main().catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[seed] failed: ${message}`);
  await disconnectDB().catch(() => undefined);
  process.exit(1);
});
