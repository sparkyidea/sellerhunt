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
 * rows. Cooldowns are code constants in `utils/scan-cooldowns.ts` (shared by
 * the cron sweep, the parent prefilters and the child self-gates); old
 * cooldown payload fields are ignored. The LLM model, reasoning effort and
 * request cap live in `keywords/extract-keywords.ts`; leaf fetches are always
 * sequential.
 */
import { db } from "@dashseller/db";
import { scanConfig } from "@dashseller/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

/** Cron selection needs room for both first scans and refreshes. */
export const cronBatchSizeSchema = z
  .number()
  .int()
  .min(2, "Cron batch size must be at least 2 to reserve refresh capacity");

/**
 * Runtime tunables for one marketplace scan, mirrored from the `scan_config`
 * row. This Zod schema is the single source of truth: `ScanConfig` is inferred
 * from it, and the workflow tasks reuse it (via `scanConfigSchema.optional()`)
 * to validate an inlined config — parents pass their already-loaded config down
 * to children so a fan-out doesn't re-fetch the row per run. Both database
 * loaders parse rows with this schema, keeping stored and inline configuration
 * subject to the same validation.
 */
export const scanConfigSchema = z.object({
  enabled: z.boolean(),
  keywordBatchSize: cronBatchSizeSchema,
  /** LLM kill switch. Off → new listings persist unresolved, no attempt spent. */
  keywordLlmEnabled: z.boolean(),
  listingBatchSize: cronBatchSizeSchema,
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
  sellerBatchSize: cronBatchSizeSchema,
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
  return scanConfigSchema.parse(row);
}
