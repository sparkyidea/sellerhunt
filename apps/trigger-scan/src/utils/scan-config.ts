/**
 * Per-marketplace scanner config loader. Reads `scan_config` and shapes it
 * into a typed value the workflow tasks can consume.
 *
 * The DB row is the single source of truth for runtime tunables — admins
 * tweak it via UPDATE without redeploying. Code defaults are intentionally
 * absent: if a marketplace has no config row, the loader throws so we don't
 * silently scan with surprise values.
 *
 * Only kill switches, business thresholds and per-marketplace tuning are
 * rows. Cooldowns are inline in the cron tasks and freshness checks; old
 * cooldown payload fields are ignored. The LLM model, reasoning
 * effort and request cap live in
 * `keywords/extract-keywords.ts`; leaf fetches are always sequential.
 */
import { db } from "@dashseller/db";
import { scanConfig } from "@dashseller/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

/**
 * Runtime tunables for one marketplace scan, mirrored from the `scan_config`
 * row. This Zod schema is the single source of truth: `ScanConfig` is inferred
 * from it, and the workflow tasks reuse it (via `scanConfigSchema.optional()`)
 * to validate an inlined config — parents pass their already-loaded config down
 * to children so a fan-out doesn't re-fetch the row per run. Deriving the type
 * from the schema keeps the two from drifting: add a field here and both the
 * type and `loadScanConfig`'s return stop compiling until it's wired through.
 */
export const scanConfigSchema = z.object({
  enabled: z.boolean(),
  keywordBatchSize: z.number(),
  /** LLM kill switch. Off → new listings persist unresolved, no attempt spent. */
  keywordLlmEnabled: z.boolean(),
  listingBatchSize: z.number(),
  /** Listings scanned per `scan-listings-by-ids` leaf run + fan-out threshold. */
  listingScanBatchSize: z.number(),
  /** Max jittered delay (ms) before each getListing in a leaf run. */
  listingScanDelayMaxMs: z.number(),
  /** Min jittered delay (ms) before each getListing in a leaf run. */
  listingScanDelayMinMs: z.number(),
  marketplace: z.string(),
  maxPriceCents: z.number().nullable(),
  maxSearchPages: z.number(),
  minItemSold: z.number(),
  minPriceCents: z.number(),
  minSoldLast24h: z.number().nullable(),
  sellerBatchSize: z.number(),
});

export type ScanConfig = z.infer<typeof scanConfigSchema>;

type ScanConfigRow = typeof scanConfig.$inferSelect;

export async function loadScanConfig(marketplace: string): Promise<ScanConfig> {
  const [row] = await db
    .select()
    .from(scanConfig)
    .where(eq(scanConfig.marketplace, marketplace))
    .limit(1);

  if (!row) {
    throw new Error(
      `loadScanConfig: no scan_config row for marketplace=${marketplace}. ` +
        "Seed one before running the scanner."
    );
  }

  return toScanConfig(row);
}

/** Every configured marketplace — for tasks that sweep all of them. */
export async function loadAllScanConfigs(): Promise<ScanConfig[]> {
  const rows = await db.select().from(scanConfig);
  return rows.map(toScanConfig);
}

function toScanConfig(row: ScanConfigRow): ScanConfig {
  return {
    marketplace: row.marketplace,
    enabled: row.enabled,
    maxSearchPages: row.maxSearchPages,
    minItemSold: row.minItemSold,
    minPriceCents: row.minPriceCents,
    maxPriceCents: row.maxPriceCents,
    minSoldLast24h: row.minSoldLast24h,
    keywordBatchSize: row.keywordBatchSize,
    sellerBatchSize: row.sellerBatchSize,
    listingBatchSize: row.listingBatchSize,
    listingScanBatchSize: row.listingScanBatchSize,
    listingScanDelayMinMs: row.listingScanDelayMinMs,
    listingScanDelayMaxMs: row.listingScanDelayMaxMs,
    keywordLlmEnabled: row.keywordLlmEnabled,
  };
}
