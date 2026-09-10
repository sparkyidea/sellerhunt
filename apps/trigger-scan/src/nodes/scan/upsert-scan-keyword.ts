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
import { chunk } from "../../utils/chunk";

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

/** Register recoverable manual work without altering any existing keyword state. */
export async function registerScanKeywords(
  marketplace: string,
  keywords: readonly string[]
): Promise<void> {
  const now = new Date();
  for (const batch of chunk([...new Set(keywords)], 1000)) {
    if (batch.length === 0) {
      continue;
    }
    await db
      .insert(scanKeyword)
      .values(
        batch.map((keyword) => ({
          marketplace,
          keyword,
          source: "manual",
          firstSeenAt: now,
          lastSeenAt: now,
        }))
      )
      .onConflictDoNothing({
        target: [scanKeyword.marketplace, scanKeyword.keyword],
      });
  }
}
