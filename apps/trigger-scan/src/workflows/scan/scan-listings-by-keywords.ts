/**
 * Bulk launcher (plural) — fan out an array of keywords to the
 * `scanListingsByKeyword` single-action task, fire-and-forget.
 *
 * Triggered by the cron heartbeat with the tick's stale keywords (and usable
 * standalone to scan an ad-hoc keyword list). Mirrors `scanListingsByIds`: pure
 * orchestration, self-chunks to Trigger's 1000-item `batchTrigger` cap, and
 * stamps a global per-keyword key with a two-hour launch TTL so the same
 * keyword isn't re-enqueued within that window. Each single task still self-gates
 * on `scan_keyword.last_scanned_at`.
 */
import { logger, metadata, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { BATCH_TRIGGER_AND_WAIT_MAX } from "../../utils/batch-trigger-and-wait-in-waves";
import { setMachineMetadata } from "../../utils/machine-metadata";
import { loadScanConfig, scanConfigSchema } from "../../utils/scan-config";
import { scanLaunchOptions } from "../../utils/scan-launch-options";
import { scanListingsByKeyword } from "./scan-listings-by-keyword";

const scanListingsByKeywordsSchema = z.object({
  config: scanConfigSchema.optional(),
  keywords: z
    .array(z.string())
    .min(
      1,
      "scanListingsByKeywords (bulk launcher) requires a non-empty keywords array; trigger scan-listings-by-keyword (singular) with { marketplace, keyword } to scan one"
    ),
  marketplace: z.string().min(1),
});

export type ScanListingsByKeywordsPayload = z.infer<
  typeof scanListingsByKeywordsSchema
>;

export const scanListingsByKeywords = schemaTask({
  id: "scan-listings-by-keywords",
  schema: scanListingsByKeywordsSchema,
  // Pure orchestration: chunk + batchTrigger, no HTTP.
  machine: "micro",
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10_000,
  },
  run: async (payload) => {
    await setMachineMetadata();
    const { marketplace, keywords } = payload;
    const config = payload.config ?? (await loadScanConfig(marketplace));

    metadata
      .set("marketplace", marketplace)
      .set("keywordCount", keywords.length)
      .set("status", "launching");

    let triggered = 0;
    for (let i = 0; i < keywords.length; i += BATCH_TRIGGER_AND_WAIT_MAX) {
      const chunk = keywords.slice(i, i + BATCH_TRIGGER_AND_WAIT_MAX);
      await scanListingsByKeyword.batchTrigger(
        await Promise.all(
          chunk.map(async (keyword) => ({
            payload: { marketplace, keyword, config },
            options: {
              tags: [`scan_keyword_${keyword}`, `marketplace_${marketplace}`],
              ...(await scanLaunchOptions("keyword", marketplace, keyword)),
            },
          }))
        )
      );
      triggered += chunk.length;
    }

    metadata.set("status", "completed").set("triggered", triggered);
    logger.info("Launched keyword scans", { marketplace, triggered });
    return { marketplace, triggered };
  },
});
