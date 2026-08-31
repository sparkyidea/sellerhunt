/**
 * Seed the `marketplace_category` table with eBay categories + mappings.
 *
 * Reads eBay category files and per-category mapping files to populate
 * the marketplace_category table with all eBay categories and their
 * mapping to canonical Shopify categories (confidence + source).
 *
 * Prerequisites:
 *   - `category` table must be seeded first (run category.ts)
 *   - `marketplace` table must have "ebay" entry (run marketplace.ts)
 *
 * Usage:
 *   bun run packages/db/src/seed/marketplace-category.ts
 */

import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { marketplaceCategory } from "../schema/marketplace-category";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({
  path: resolve(__dirname, "../../../../apps/api/.env"),
});

const db = drizzle(process.env.DATABASE_URL || "");

const TAXONOMY_DIR = resolve(__dirname, "../../../taxonomy/data");
const EBAY_INTEGRATIONS_DIR = join(TAXONOMY_DIR, "integrations/ebay");
const MARKETPLACE_ID = "ebay";
const SITE_ID = "EBAY_US";

interface EbayCategory {
  fullName: string;
  id: string;
  leaf: boolean;
  level: number;
  name: string;
  parentId: string | null;
}

interface MappingEntry {
  confidence: number;
  ebayFullName: string;
  ebayId: string;
  mappingSource: string;
  shopifyCategoryId: string;
  shopifyFullName: string;
}

async function resolveEbayVersion(): Promise<string> {
  const entries = await readdir(EBAY_INTEGRATIONS_DIR);
  const versions = entries
    .filter((f) => !(f.startsWith(".") || f.endsWith(".json")))
    .sort();
  const latest = versions.at(-1);
  if (!latest) {
    throw new Error("No eBay version directories found");
  }
  return latest;
}

async function seedMarketplaceCategories() {
  const ebayVersion = await resolveEbayVersion();
  const categoriesDir = join(EBAY_INTEGRATIONS_DIR, ebayVersion, "categories");
  const mappingsDir = join(
    EBAY_INTEGRATIONS_DIR,
    ebayVersion,
    "mappings/categories"
  );

  console.log(`Seeding marketplace categories (eBay v${ebayVersion})...`);

  // Load all eBay categories from vertical files
  const sourceFiles = (await readdir(categoriesDir))
    .filter((f) => f.endsWith(".json") && f !== "categories.json")
    .sort();

  // Load mapping data for confidence/source info
  const mappingByEbayId = new Map<
    string,
    { confidence: number; mappingSource: string }
  >();

  for (const file of sourceFiles) {
    const slug = file.replace(".json", "");
    const mappingPath = join(mappingsDir, `${slug}.json`);
    if (!existsSync(mappingPath)) {
      continue;
    }
    const content = await readFile(mappingPath, "utf-8");
    const data = JSON.parse(content) as { mappings: MappingEntry[] };
    for (const m of data.mappings) {
      mappingByEbayId.set(m.ebayId, {
        confidence: m.confidence,
        mappingSource: m.mappingSource,
      });
    }
  }

  // Load flat mapping (ebayId -> shopifyCategoryId)
  const toShopifyPath = join(
    EBAY_INTEGRATIONS_DIR,
    ebayVersion,
    "mappings/mappings.json"
  );
  const toShopify = JSON.parse(
    await readFile(toShopifyPath, "utf-8")
  ) as Record<string, string>;

  console.log(`  ${Object.keys(toShopify).length} mappings loaded`);

  // Process each vertical file
  let totalUpserted = 0;

  for (const file of sourceFiles) {
    const content = await readFile(join(categoriesDir, file), "utf-8");
    const data = JSON.parse(content) as {
      vertical: string;
      categories: EbayCategory[];
    };

    const CHUNK_SIZE = 500;
    for (let i = 0; i < data.categories.length; i += CHUNK_SIZE) {
      const chunk = data.categories.slice(i, i + CHUNK_SIZE);
      const values = chunk.map((cat) => {
        const shopifyCategoryId = toShopify[cat.id];
        const mapping = mappingByEbayId.get(cat.id);
        // Map "na" to null (no valid category match)
        const resolvedCategoryId =
          shopifyCategoryId && shopifyCategoryId !== "na"
            ? shopifyCategoryId
            : null;

        return {
          marketplaceId: MARKETPLACE_ID,
          siteId: SITE_ID,
          reference: cat.id,
          categoryId: resolvedCategoryId,
          name: cat.name,
          fullName: cat.fullName,
          parentReference: cat.parentId,
          leaf: cat.leaf,
          mappingConfidence: mapping?.confidence ?? null,
          mappingSource: mapping?.mappingSource ?? null,
        };
      });

      await db
        .insert(marketplaceCategory)
        .values(values)
        .onConflictDoUpdate({
          target: [
            marketplaceCategory.marketplaceId,
            marketplaceCategory.siteId,
            marketplaceCategory.reference,
          ],
          set: {
            categoryId: sql`EXCLUDED.category_id`,
            name: sql`EXCLUDED.name`,
            fullName: sql`EXCLUDED.full_name`,
            parentReference: sql`EXCLUDED.parent_reference`,
            leaf: sql`EXCLUDED.leaf`,
            mappingConfidence: sql`EXCLUDED.mapping_confidence`,
            mappingSource: sql`EXCLUDED.mapping_source`,
            updatedAt: new Date(),
          },
        });

      totalUpserted += chunk.length;
    }

    console.log(`  ${data.vertical}: ${data.categories.length} categories`);
  }

  console.log(`\nDone. ${totalUpserted} marketplace categories seeded.`);

  // Backfill products with null categoryId from improved mappings
  const backfillResult = await db.execute(sql`
    UPDATE product p
    SET category_id = mc.category_id, updated_at = NOW()
    FROM listing l
    JOIN marketplace_category mc ON mc.id = l.marketplace_category_id
    WHERE l.product_id = p.id
      AND p.category_id IS NULL
      AND mc.category_id IS NOT NULL
  `);

  const backfilled = backfillResult.rowCount ?? 0;
  if (backfilled > 0) {
    console.log(`Backfilled ${backfilled} products with resolved categoryId.`);
  }
}

try {
  await seedMarketplaceCategories();
} catch (error) {
  console.error("Error seeding marketplace categories:", error);
  process.exit(1);
}

process.exit(0);
