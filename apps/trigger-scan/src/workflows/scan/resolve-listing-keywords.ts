/**
 * Keyword extraction retry tool — manual only. The scan itself extracts
 * keywords (`scan-listings-by-ids` sends every newly inserted listing to the
 * LLM at the end of its leaf); this task is for listings that fell through —
 * the switch was off, the key was missing, a batch failed, a leaf died
 * mid-stage. Nothing schedules it; trigger it by hand.
 *
 * Pass `listingIds` to retry specific listings; omit them to catch up on
 * every unresolved listing with attempts left, `limit` at a time (default
 * `DEFAULT_LIMIT`). Both modes only pick `keyword_id IS NULL AND
 * keyword_attempts < MAX_LLM_ATTEMPTS` — explicit ids do not bypass the cap.
 * When `keyword_llm_enabled` is off the run exits without picking or spending
 * an attempt. `concurrencyLimit: 1` keeps two manual runs from
 * double-spending. Unlike the scan tasks it does not accept a `config` in its
 * payload: the `scan_config` row is read fresh on every run.
 */
import { logger, metadata, tags, task } from "@trigger.dev/sdk";
import {
  loadUnresolvedListings,
  pickUnresolvedListings,
  resolveKeywordsWithLlm,
} from "../../nodes/scan/resolve-keywords-with-llm";
import { setMachineMetadata } from "../../utils/machine-metadata";
import { loadScanConfig } from "../../utils/scan-config";

/** Catch-up mode: listings picked per run when the payload sets no `limit`. */
const DEFAULT_LIMIT = 200;

export interface ResolveListingKeywordsPayload {
  /** Catch-up mode only: how many unresolved listings to pick (default 200). */
  limit?: number;
  /** `scan_listing.id`s to retry. Omit to catch up on unresolved listings. */
  listingIds?: string[];
  marketplace: string;
}

export const resolveListingKeywords = task({
  id: "resolve-listing-keywords",
  // Two manual runs must not double-spend on the same listings.
  queue: { concurrencyLimit: 1 },
  // DB queries + small HTTP batches; no marketplace scraping, no persona.
  machine: "micro",
  retry: {
    maxAttempts: 1,
    factor: 1.5,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 5000,
    outOfMemory: { machine: "small-1x" },
  },
  run: async (payload: ResolveListingKeywordsPayload) => {
    await setMachineMetadata();
    const { marketplace } = payload;
    await tags.add("keyword_resolve");
    await tags.add(`marketplace_${marketplace}`);
    metadata.set("marketplace", marketplace).set("status", "loading-config");

    // Always read the row: the kill switch must take effect on the next run,
    // not on the next cron tick.
    const config = await loadScanConfig(marketplace);
    if (!config.enabled) {
      metadata.set("status", "disabled");
      logger.info("Scanner disabled for marketplace", { marketplace });
      return { marketplace, skipped: true, reason: "disabled" };
    }
    if (!config.keywordLlmEnabled) {
      metadata.set("status", "llm-disabled");
      logger.info("Keyword LLM disabled; nothing to retry", { marketplace });
      return { marketplace, skipped: true, reason: "llm-disabled" };
    }

    metadata.set("status", "picking");
    const picked =
      payload.listingIds && payload.listingIds.length > 0
        ? await loadUnresolvedListings(marketplace, payload.listingIds)
        : await pickUnresolvedListings(
            marketplace,
            payload.limit ?? DEFAULT_LIMIT
          );

    metadata.set("status", "llm-pass").set("picked", picked.length);
    const totals = await resolveKeywordsWithLlm(config, picked);

    metadata
      .set("status", "completed")
      .set("resolved", totals.resolved)
      .set("unresolved", totals.unresolved)
      .set("failed", totals.failed)
      .set("llmSkipped", totals.llmSkipped);
    logger.info("Keyword retry completed", {
      marketplace,
      picked: picked.length,
      ...totals,
    });
    return { marketplace, skipped: false, picked: picked.length, ...totals };
  },
});
