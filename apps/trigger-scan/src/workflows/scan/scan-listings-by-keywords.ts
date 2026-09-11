/** Bulk manual/cron intake. A successful return confirms dispatch or existing work. */
import { logger, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { registerScanKeywords } from "../../nodes/scan/upsert-scan-keyword";
import { batchWaves } from "../../utils/scan-batch";
import { assertScanEntitySupported } from "../../utils/scan-capabilities";
import { scanConfigSchema } from "../../utils/scan-config";
import { inFlight } from "../../utils/scan-in-flight";
import { launchTags } from "../../utils/scan-tags";
import { scanListingsByKeyword } from "./scan-listings-by-keyword";

const schema = z.object({
  config: scanConfigSchema.optional(),
  marketplace: z.string().min(1),
  keywords: z.array(z.string().min(1)).min(1),
});
export type ScanListingsByKeywordsPayload = z.infer<typeof schema>;
export const scanListingsByKeywords = schemaTask({
  id: "scan-listings-by-keywords",
  schema,
  machine: "micro",
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10_000,
  },
  run: async ({ marketplace, keywords, config }) => {
    assertScanEntitySupported(marketplace, "keyword");
    const distinct = [...new Set(keywords)];
    await registerScanKeywords(marketplace, distinct);
    // Failures throw: SDK retries, and registered rows also remain recoverable by cron.
    const running = await inFlight("keyword", marketplace);
    const pending = distinct.filter((keyword) => !running.has(keyword));
    for (const wave of batchWaves(pending)) {
      if (wave.length === 0) {
        continue;
      }
      await scanListingsByKeyword.batchTrigger(
        wave.map((keyword) => ({
          payload: { marketplace, keyword, config },
          options: { tags: launchTags(marketplace, "keyword", keyword) },
        }))
      );
    }
    logger.info("Dispatched keywords", {
      marketplace,
      triggered: pending.length,
    });
    return {
      marketplace,
      triggered: pending.length,
      skippedInFlight: distinct.length - pending.length,
    };
  },
});
