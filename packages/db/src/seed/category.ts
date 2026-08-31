/**
 * Seed the `category` table with Shopify canonical taxonomy.
 *
 * Reads all 26 Shopify vertical files from @dashseller/taxonomy data
 * and upserts ~12K categories. Inserts level-by-level to respect
 * the self-referential parent_id FK constraint.
 *
 * Usage:
 *   bun run packages/db/src/seed/category.ts
 */

import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { category } from "../schema/category";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({
  path: resolve(__dirname, "../../../../apps/api/.env"),
});

const db = drizzle(process.env.DATABASE_URL || "");

const SHOPIFY_DIR = resolve(__dirname, "../../../taxonomy/data/categories");

interface ShopifyCategory {
  children: { id: string; name: string }[];
  full_name: string;
  id: string;
  level: number;
  name: string;
  parent_id: string | null;
}

async function seedCategories() {
  console.log("Seeding categories from Shopify taxonomy...");

  // Load all categories from all vertical files
  const files = (await readdir(SHOPIFY_DIR)).filter(
    (f) => f.endsWith(".json") && !f.startsWith(".")
  );

  const allCategories: ShopifyCategory[] = [];
  for (const file of files) {
    const content = await readFile(join(SHOPIFY_DIR, file), "utf-8");
    const data = JSON.parse(content) as {
      version: string;
      categories: ShopifyCategory[];
    };
    allCategories.push(...data.categories);
  }

  console.log(
    `  Loaded ${allCategories.length} categories from ${files.length} files`
  );

  // Group by level so we insert parents before children (FK constraint)
  const byLevel = new Map<number, ShopifyCategory[]>();
  for (const cat of allCategories) {
    const existing = byLevel.get(cat.level) ?? [];
    existing.push(cat);
    byLevel.set(cat.level, existing);
  }

  const levels = [...byLevel.keys()].sort((a, b) => a - b);
  let totalUpserted = 0;

  for (const level of levels) {
    const cats = byLevel.get(level) ?? [];
    const CHUNK_SIZE = 500;

    for (let i = 0; i < cats.length; i += CHUNK_SIZE) {
      const chunk = cats.slice(i, i + CHUNK_SIZE);
      const values = chunk.map((cat) => ({
        id: cat.id,
        parentId: cat.parent_id,
        name: cat.name,
        fullName: cat.full_name,
        level: cat.level,
        leaf: cat.children.length === 0,
      }));

      await db
        .insert(category)
        .values(values)
        .onConflictDoUpdate({
          target: category.id,
          set: {
            parentId: sql`EXCLUDED.parent_id`,
            name: sql`EXCLUDED.name`,
            fullName: sql`EXCLUDED.full_name`,
            level: sql`EXCLUDED.level`,
            leaf: sql`EXCLUDED.leaf`,
            updatedAt: new Date(),
          },
        });

      totalUpserted += chunk.length;
    }

    console.log(`  Level ${level}: ${cats.length} categories`);
  }

  console.log(`\nDone. ${totalUpserted} categories seeded.`);
}

try {
  await seedCategories();
} catch (error) {
  console.error("Error seeding categories:", error);
  process.exit(1);
}

process.exit(0);
