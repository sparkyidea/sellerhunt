/**
 * Bulk launcher (plural) — fan out an array of keywords to the
 * `scanListingsByKeyword` single-action task, fire-and-forget.
 *
 * Triggered by the cron heartbeat with the tick's stale keywords (and usable
 * standalone to scan an ad-hoc keyword list). Mirrors `scanListingsByIds`: pure
 * orchestration, self-chunks to Trigger's 1000-item `batchTrigger` cap, and
 * stamps a per-keyword idempotency key (scoped to the rescan window) so the same
 * keyword isn't re-enqueued within the window. Each single task still self-gates
 * on `scan_keyword.last_scanned_at`.
 */
import { logger, metadata, task } from "@trigger.dev/sdk";
import { BATCH_TRIGGER_AND_WAIT_MAX } from "../../utils/batch-trigger-and-wait-in-waves";
import { setMachineMetadata } from "../../utils/machine-metadata";
import { loadScanConfig, type ScanConfig } from "../../utils/scan-config";
import { scanListingsByKeyword } from "./scan-listings-by-keyword";

export interface ScanListingsByKeywordsPayload {
  config?: ScanConfig;
  keywords: string[];
  marketplace: string;
}

export const scanListingsByKeywords = task({
  id: "scan-listings-by-keywords",
  // Pure orchestration: chunk + batchTrigger, no HTTP.
  machine: "micro",
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10_000,
  },
  run: async (payload: ScanListingsByKeywordsPayload) => {
    await setMachineMetadata();
    const { marketplace, keywords } = payload;
    if (!marketplace) {
      throw new Error(
        "scanListingsByKeywords: payload.marketplace is required"
      );
    }
    if (!Array.isArray(keywords) || keywords.length === 0) {
      throw new Error(
        "scanListingsByKeywords (bulk launcher) requires payload.keywords: string[]. " +
          "To scan a single keyword, trigger `scan-listings-by-keyword` (singular) " +
          "with { marketplace, keyword }."
      );
    }
    const config = payload.config ?? (await loadScanConfig(marketplace));
    const ttl = `${config.keywordRescanAfter}m`;

    metadata
      .set("marketplace", marketplace)
      .set("keywordCount", keywords.length)
      .set("status", "launching");

    let triggered = 0;
    for (let i = 0; i < keywords.length; i += BATCH_TRIGGER_AND_WAIT_MAX) {
      const chunk = keywords.slice(i, i + BATCH_TRIGGER_AND_WAIT_MAX);
      await scanListingsByKeyword.batchTrigger(
        chunk.map((keyword) => ({
          payload: { marketplace, keyword, config },
          options: {
            tags: [`scan_keyword_${keyword}`, `marketplace_${marketplace}`],
            idempotencyKey: ["keyword", marketplace, keyword],
            idempotencyKeyTTL: ttl,
          },
        }))
      );
      triggered += chunk.length;
    }

    metadata.set("status", "completed").set("triggered", triggered);
    logger.info("Launched keyword scans", { marketplace, triggered });
    return { marketplace, triggered };
  },
});
