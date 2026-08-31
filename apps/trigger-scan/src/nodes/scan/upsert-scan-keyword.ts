/**
 * Insert/refresh `scan_keyword` rows.
 *
 * Two write paths:
 *   - `markScanned`: bumps `last_scanned_at = NOW()` after a keyword scan
 *     completes. Used by `scanListingsByKeyword` to reset the freshness clock.
 *   - `recordExtracted`: inserts new keyword rows or bumps `last_seen_at` on
 *     existing ones. Used by `scanOneListing` after extracting keywords
 *     from a listing title. Critically does NOT touch `last_scanned_at` —
 *     re-extraction must not skip the next scheduled scan.
 */
import { db } from "@dashseller/db";
import { scanKeyword } from "@dashseller/db/schema";
import { sql } from "drizzle-orm";

/**
 * Bumps `last_scanned_at = NOW()`. UPSERTs to handle the manual-trigger case
 * where someone fires `scanListingsByKeyword` for a keyword that hasn't been
 * seeded yet. New rows get `source = "manual"`; existing rows keep their
 * source untouched.
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

/**
 * Bulk upsert: insert any keyword that doesn't exist, bump `last_seen_at` on
 * any that do. `last_scanned_at` is left untouched on conflict.
 *
 * Source defaults to "extracted" since this is the listing → keyword path.
 */
export async function recordExtractedKeywords(
  marketplace: string,
  keywords: string[]
): Promise<void> {
  if (keywords.length === 0) {
    return;
  }

  const now = new Date();
  await db
    .insert(scanKeyword)
    .values(
      keywords.map((keyword) => ({
        marketplace,
        keyword,
        source: "extracted",
        firstSeenAt: now,
        lastSeenAt: now,
      }))
    )
    .onConflictDoUpdate({
      target: [scanKeyword.marketplace, scanKeyword.keyword],
      set: { lastSeenAt: sql`excluded.last_seen_at` },
    });
}
