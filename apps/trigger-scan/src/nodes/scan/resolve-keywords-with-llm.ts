/**
 * IO wrapper around the keyword LLM stage (`keywords/llm-stage.ts`): wires
 * the OpenAI client and the DB store and applies the kill switch. Shared by
 * the listing leaf (`scan-listings-by-ids`, inline right after its paced
 * scan — same container, no second run) and the manual retry task
 * (`resolve-listing-keywords`).
 *
 * Never throws. The switch being off or the key missing skips the listings
 * without spending an attempt; everything past that is handled inside the
 * stage. So a scan run is never failed (and retried, and re-scraped)
 * because of the LLM.
 *
 * Also owns the two DB pickers the retry task uses.
 */
import { db } from "@dashseller/db";
import { scanListing } from "@dashseller/db/schema";
import { logger } from "@trigger.dev/sdk";
import { and, asc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import type { PhraseParser } from "../../keywords/extract-keywords";
import {
  type LlmKeywordTotals,
  MAX_LLM_ATTEMPTS,
  runKeywordLlmStage,
  type UnresolvedListing,
} from "../../keywords/llm-stage";
import { createOpenAIClient } from "../../keywords/openai-client";
import type { ScanConfig } from "../../utils/scan-config";
import { dbKeywordStore } from "./keyword-store";

/**
 * The only runtime knob: the kill switch. The marketplace is a separate
 * argument, taken from the task payload — never from `config`, which a
 * manual trigger can override with a row for a different marketplace.
 */
export type KeywordLlmConfig = Pick<ScanConfig, "keywordLlmEnabled">;

export interface ResolveKeywordsTotals extends LlmKeywordTotals {
  /** Listings not sent: LLM disabled or no API key. No attempt spent. */
  llmSkipped: number;
}

const listingColumns = {
  id: scanListing.id,
  title: scanListing.title,
  categoryPath: scanListing.categoryPath,
};

/** Only the given ids, and only those still unresolved with attempts left. */
export async function loadUnresolvedListings(
  marketplace: string,
  listingIds: readonly string[]
): Promise<UnresolvedListing[]> {
  if (listingIds.length === 0) {
    return [];
  }
  return await db
    .select(listingColumns)
    .from(scanListing)
    .where(
      and(
        eq(scanListing.marketplace, marketplace),
        inArray(scanListing.id, [...listingIds]),
        eq(scanListing.qualified, true),
        isNull(scanListing.keywordId),
        lt(scanListing.keywordAttempts, MAX_LLM_ATTEMPTS)
      )
    );
}

/** Catch-up mode: unresolved listings with attempts left, fewest attempts first, then oldest. */
export async function pickUnresolvedListings(
  marketplace: string,
  limit: number
): Promise<UnresolvedListing[]> {
  return await db
    .select(listingColumns)
    .from(scanListing)
    .where(
      and(
        eq(scanListing.marketplace, marketplace),
        eq(scanListing.qualified, true),
        isNull(scanListing.keywordId),
        lt(scanListing.keywordAttempts, MAX_LLM_ATTEMPTS)
      )
    )
    .orderBy(
      asc(scanListing.keywordAttempts),
      sql`COALESCE(${scanListing.lastScannedAt}, ${scanListing.createdAt}) ASC`,
      asc(scanListing.id)
    )
    .limit(Math.max(1, limit));
}

/**
 * Send `listings` (rows of `marketplace`) through the LLM stage. `parser`
 * defaults to a fresh OpenAI client; inject one in tests.
 */
export async function resolveKeywordsWithLlm(
  marketplace: string,
  config: KeywordLlmConfig,
  listings: readonly UnresolvedListing[],
  parser?: PhraseParser
): Promise<ResolveKeywordsTotals> {
  if (listings.length === 0) {
    return skipped(0);
  }
  if (!config.keywordLlmEnabled) {
    logger.info("Keyword LLM disabled; leaving listings unresolved", {
      marketplace,
      pending: listings.length,
    });
    return skipped(listings.length);
  }

  let parse = parser;
  if (!parse) {
    try {
      const client = createOpenAIClient();
      parse = (body) => client.responses.parse(body);
    } catch (error) {
      logger.warn("Keyword LLM unavailable; leaving listings unresolved", {
        marketplace,
        pending: listings.length,
        error: error instanceof Error ? error.message : String(error),
      });
      return skipped(listings.length);
    }
  }

  const totals = await runKeywordLlmStage(
    { parse, store: dbKeywordStore },
    marketplace,
    listings
  );
  return { ...totals, llmSkipped: 0 };
}

function skipped(count: number): ResolveKeywordsTotals {
  return { failed: 0, resolved: 0, unresolved: 0, llmSkipped: count };
}
