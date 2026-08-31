import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { marketplace } from "../schema/marketplace";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({
  path: resolve(__dirname, "../../../../apps/api/.env"),
});

const db = drizzle(process.env.DATABASE_URL || "");

const MARKETPLACES = [
  {
    id: "ebay",
    name: "eBay",
    logoUrl: "/marketplace-logos/ebay.png",
    archived: false,
  },
  {
    id: "shopify",
    name: "Shopify",
    logoUrl: "/marketplace-logos/shopify.png",
    archived: false,
  },
];

/**
 * Seed the database with initial marketplace data
 */
async function seedMarketplace() {
  console.log("Seeding marketplaces...");

  try {
    await db
      .insert(marketplace)
      .values(MARKETPLACES)
      .onConflictDoUpdate({
        target: marketplace.id,
        set: {
          name: sql`EXCLUDED.name`,
          logoUrl: sql`EXCLUDED.logo_url`,
          updatedAt: new Date(),
        },
      });

    console.log(
      `Done. Seeded ${MARKETPLACES.length} marketplaces: ${MARKETPLACES.map((m) => m.id).join(", ")}.`
    );
  } catch (error) {
    console.error("Error seeding marketplace:", error);
    process.exit(1);
  }

  process.exit(0);
}

seedMarketplace();
