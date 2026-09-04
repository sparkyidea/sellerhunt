/**
 * DB-backed `KeywordStore` for the keyword LLM stage (`keywords/llm-stage.ts`).
 *
 * `linkListingKeyword` finds or creates the `scan_keyword` row for the phrase
 * in one statement — `ON CONFLICT (marketplace, keyword)` reuses a manually
 * seeded keyword on an exact match and only bumps `last_seen_at` (never
 * `last_scanned_at`, so learning a keyword can't skip its next scheduled
 * search; never `source`) — then points the listing at it. New rows are
 * `source = "llm"` with `last_scanned_at` null, so the cron's stale-keyword
 * picker will search them. The listing update is conditional on
 * `keyword_id IS NULL`: a scan leaf and a catch-up retry run can both hold
 * the same freshly inserted listing while awaiting OpenAI, and the first
 * answer to land must win — `linked: false` tells the stage it lost.
 *
 * `bumpKeywordAttempts` counts one LLM attempt per listing so a poison title
 * stops after `MAX_LLM_ATTEMPTS`.
 */
import { db } from "@dashseller/db";
import { scanKeyword, scanListing } from "@dashseller/db/schema";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { KeywordStore } from "../../keywords/llm-stage";

export const dbKeywordStore: KeywordStore = {
  async linkListingKeyword(input) {
    const now = new Date();
    return await db.transaction(async (tx) => {
      const [keyword] = await tx
        .insert(scanKeyword)
        .values({
          marketplace: input.marketplace,
          keyword: input.keyword,
          source: "llm",
          firstSeenAt: now,
          lastSeenAt: now,
        })
        .onConflictDoUpdate({
          target: [scanKeyword.marketplace, scanKeyword.keyword],
          set: { lastSeenAt: now },
        })
        .returning({ id: scanKeyword.id });
      if (!keyword) {
        throw new Error(
          `linkListingKeyword: upsert returned no row for "${input.keyword}"`
        );
      }
      const claimed = await tx
        .update(scanListing)
        .set({ keywordId: keyword.id })
        .where(
          and(
            eq(scanListing.id, input.listingId),
            isNull(scanListing.keywordId)
          )
        )
        .returning({ id: scanListing.id });
      return { keywordId: keyword.id, linked: claimed.length > 0 };
    });
  },

  async bumpKeywordAttempts(listingIds) {
    if (listingIds.length === 0) {
      return;
    }
    await db
      .update(scanListing)
      .set({ keywordAttempts: sql`${scanListing.keywordAttempts} + 1` })
      .where(inArray(scanListing.id, [...listingIds]));
  },
};
