import { logger } from "@trigger.dev/sdk";
import { chunk } from "../../utils/chunk";
import { batchWaves } from "../../utils/scan-batch";
import type { ScanConfig } from "../../utils/scan-config";
import { scanListingsByIds } from "../../workflows/scan/scan-listings-by-ids";
import type { ListingVerdict } from "./listing-verdict";

/** Consume successful siblings even when a child or a later API handoff fails. */
export async function waitForListingBatches(
  marketplace: string,
  ids: string[],
  config: ScanConfig,
  tags: string[]
) {
  const chunks = chunk(ids, Math.max(1, config.listingScanBatchSize));
  const verdicts: ListingVerdict[] = [];
  let failed = 0;
  for (const wave of batchWaves(chunks)) {
    if (wave.length === 0) {
      continue;
    }
    try {
      const result = await scanListingsByIds.batchTriggerAndWait(
        wave.map((listingIds) => ({
          payload: { marketplace, listingIds, config },
          options: { tags },
        }))
      );
      for (const run of result.runs) {
        if (run.ok) {
          verdicts.push(...run.output.verdicts);
        } else {
          failed += 1;
        }
      }
      failed += Math.max(0, wave.length - result.runs.length);
    } catch (error) {
      failed += wave.length;
      logger.warn("Listing batch handoff failed", { marketplace, error });
    }
  }
  return { verdicts, failed, batches: chunks.length };
}
