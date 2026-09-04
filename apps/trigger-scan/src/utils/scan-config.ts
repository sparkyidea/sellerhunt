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
 * rows. The LLM model, reasoning effort and request cap live in
 * `keywords/extract-keywords.ts`; leaf fetches are always sequential.
 */
import { db } from "@dashseller/db";
import { scanConfig } from "@dashseller/db/schema";
import { eq } from "drizzle-orm";

export interface ScanConfig {
  enabled: boolean;
  keywordBatchSize: number;
  /** LLM kill switch. Off → new listings persist unresolved, no attempt spent. */
  keywordLlmEnabled: boolean;
  /** Minutes after last_scanned_at before a keyword is rescanned. */
  keywordRescanAfter: number;
  listingBatchSize: number;
  /** Minutes after last_scanned_at before a listing is rescanned. */
  listingRescanAfter: number;
  /** Listings scanned per `scan-listings-by-ids` leaf run + fan-out threshold. */
  listingScanBatchSize: number;
  /** Max jittered delay (ms) before each getListing in a leaf run. */
  listingScanDelayMaxMs: number;
  /** Min jittered delay (ms) before each getListing in a leaf run. */
  listingScanDelayMinMs: number;
  marketplace: string;
  maxPriceCents: number | null;
  maxSearchPages: number;
  minItemSold: number;
  minPriceCents: number;
  minSoldLast24h: number | null;
  sellerBatchSize: number;
  /** Minutes after last_scanned_at before a seller is rescanned. */
  sellerRescanAfter: number;
}

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
    keywordRescanAfter: row.keywordRescanAfter,
    sellerRescanAfter: row.sellerRescanAfter,
    listingRescanAfter: row.listingRescanAfter,
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
