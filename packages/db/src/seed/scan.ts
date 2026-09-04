/**
 * Seed `scan_config` (one row per supported marketplace) and `scan_keyword`
 * (initial keyword pool driving the discovery phase of the scanner).
 *
 * Both tables are scanner state — without them, the cron heartbeat has
 * nothing to scan. This script bootstraps a fresh DB or adds new keywords
 * to an existing pool.
 *
 * Idempotency:
 *   - scan_config: insert if missing, leave existing rows alone. Operators
 *     UPDATE values directly via SQL; re-seeding shouldn't clobber tuning.
 *   - scan_keyword: insert if missing, leave existing rows alone. Re-seeding
 *     never resets `last_scanned_at`, `last_seen_at`, or `dead_at` — which
 *     means you can safely add new keywords without disrupting the rotation.
 *
 * To extend:
 *   - Add a new marketplace: append to MARKETPLACES.
 *   - Add seed keywords: append to KEYWORDS for the relevant marketplace.
 *
 * Run:
 *   bun run packages/db/src/seed/scan.ts
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { scanConfig, scanKeyword } from "../schema/scan";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({
  path: resolve(__dirname, "../../../../apps/api/.env"),
});

const db = drizzle(process.env.DATABASE_URL || "");

/**
 * Per-marketplace scanner config seed. Values match the column defaults in
 * `scan_config`; included explicitly here so operators can see the full set
 * in one place when reasoning about a new marketplace. The LLM model,
 * reasoning effort and request size are code constants, not rows.
 */
interface ScanConfigSeed {
  enabled: boolean;
  keywordBatchSize: number;
  keywordLlmEnabled: boolean;
  keywordRescanAfter: number;
  listingBatchSize: number;
  listingRescanAfter: number;
  listingScanBatchSize: number;
  marketplace: string;
  maxPriceCents: number | null;
  maxSearchPages: number;
  minItemSold: number;
  minPriceCents: number;
  minSoldLast24h: number | null;
  sellerBatchSize: number;
  sellerRescanAfter: number;
}

const MARKETPLACES: ScanConfigSeed[] = [
  {
    marketplace: "ebay",
    enabled: true,
    keywordRescanAfter: 1440,
    sellerRescanAfter: 1440,
    listingRescanAfter: 1440,
    maxSearchPages: 10,
    minItemSold: 100,
    minPriceCents: 1000,
    maxPriceCents: null,
    minSoldLast24h: null,
    keywordBatchSize: 20,
    sellerBatchSize: 20,
    listingBatchSize: 50,
    // Listings per scan leaf (K) — also the LLM request cap, so one leaf
    // normally makes one OpenAI call.
    listingScanBatchSize: 50,
    // Keyword extraction — LLM only, every new listing once. Kill switch.
    keywordLlmEnabled: true,
  },
];

/**
 * Initial keyword pool. Operators can edit and re-run safely — existing
 * keywords keep their scan state. Seeds are lowercased to match the phrases
 * the LLM learns (the prompt asks for lowercase), so an exact match reuses
 * the seeded row.
 */
const KEYWORDS: Record<string, string[]> = {
  ebay: [
    // Add seed keywords here, e.g.:
    // "nintendo switch",
    // "pokemon cards",
    // "vintage camera",
  ],
};

async function seedScan(): Promise<void> {
  console.log("Seeding scan_config + scan_keyword...");
  let configInserted = 0;
  let configSkipped = 0;
  let keywordInserted = 0;
  let keywordSkipped = 0;

  for (const seed of MARKETPLACES) {
    const [existing] = await db
      .select({ marketplace: scanConfig.marketplace })
      .from(scanConfig)
      .where(eq(scanConfig.marketplace, seed.marketplace))
      .limit(1);

    if (existing) {
      console.log(`  scan_config/${seed.marketplace}: already configured`);
      configSkipped++;
    } else {
      await db.insert(scanConfig).values(seed);
      console.log(`  scan_config/${seed.marketplace}: inserted`);
      configInserted++;
    }

    const keywords = KEYWORDS[seed.marketplace] ?? [];
    for (const raw of keywords) {
      const keyword = raw.trim().toLowerCase();
      if (!keyword) {
        continue;
      }

      const [existingKeyword] = await db
        .select({ keyword: scanKeyword.keyword })
        .from(scanKeyword)
        .where(
          and(
            eq(scanKeyword.marketplace, seed.marketplace),
            eq(scanKeyword.keyword, keyword)
          )
        )
        .limit(1);

      if (existingKeyword) {
        keywordSkipped++;
        continue;
      }

      const now = new Date();
      await db.insert(scanKeyword).values({
        marketplace: seed.marketplace,
        keyword,
        source: "manual",
        firstSeenAt: now,
        lastSeenAt: now,
      });
      console.log(`  scan_keyword/${seed.marketplace}/${keyword}: inserted`);
      keywordInserted++;
    }
  }

  console.log(
    `Done. config: ${configInserted} inserted, ${configSkipped} skipped. ` +
      `keyword: ${keywordInserted} inserted, ${keywordSkipped} skipped.`
  );
  process.exit(0);
}

try {
  await seedScan();
} catch (error) {
  console.error("Error seeding scan tables:", error);
  process.exit(1);
}
