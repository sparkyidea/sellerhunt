/**
 * `scan_keyword` rotation bookkeeping.
 *
 * `markKeywordScanned` bumps `last_scanned_at = NOW()` after a keyword scan
 * completes (used by `scanListingsByKeyword` to reset the freshness clock).
 * Linking a listing to a keyword lives in `keyword-store.ts` and
 * bumps `last_seen_at` only — never `last_scanned_at` — so resolution can't
 * skip the next scheduled scan.
 */
import { db } from "@dashseller/db";
import { scanKeyword } from "@dashseller/db/schema";

/**
 * UPSERTs to handle the manual-trigger case where someone fires
 * `scanListingsByKeyword` for a keyword that hasn't been seeded yet. New
 * rows get `source = "manual"`; existing rows keep their source untouched.
 */
export async function markKeywordScanned(
  marketplace: string,
  keyword: string
): Promise<void> {
  const now = new Date();
  await db
    .insert(scanKeyword)
    .values({
      marketplace,
      keyword,
      source: "manual",
      firstSeenAt: now,
      lastSeenAt: now,
      lastScannedAt: now,
    })
    .onConflictDoUpdate({
      target: [scanKeyword.marketplace, scanKeyword.keyword],
      set: { lastScannedAt: now },
    });
}
