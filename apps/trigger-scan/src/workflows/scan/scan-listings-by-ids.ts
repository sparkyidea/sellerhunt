/** Listing detail leaf. Callers chunk; retries reuse fresh persisted observations.
 * Scan failures throw only after healthy work and new-listing keyword extraction.
 */
import { logger, metadata, schemaTask, tags } from "@trigger.dev/sdk";
import { z } from "zod";
import type { UnresolvedListing } from "../../keywords/llm-stage";
import { resolveKeywordsWithLlm } from "../../nodes/scan/resolve-keywords-with-llm";
import { partitionFreshListings } from "../../nodes/scan/scan-freshness";
import {
  type ListingVerdict,
  scanOneListing,
} from "../../nodes/scan/scan-one-listing";
import { setMachineMetadata } from "../../utils/machine-metadata";
import { MobileProfileTokenManager } from "../../utils/mobile-profile-manager";
import { isListingNotFound } from "../../utils/scan-completion";
import {
  loadScanConfig,
  type ScanConfig,
  scanConfigSchema,
} from "../../utils/scan-config";
import {
  errorMessage,
  isPersonaLevelError,
  ListingBatchError,
  routeScanFailure,
  scanCatchError,
} from "../../utils/scan-errors";
import { LISTING_LEAF_QUEUE } from "../../utils/scan-queues";
import { marketplaceTag } from "../../utils/scan-tags";

const scanListingsByIdsSchema = z.object({
  config: scanConfigSchema.optional(),
  listingIds: z.array(z.string()).min(1),
  marketplace: z.string().min(1),
});
export type ScanListingsByIdsPayload = z.infer<typeof scanListingsByIdsSchema>;
export interface ScanListingsByIdsResult {
  fresh: number;
  marketplace: string;
  mode: "scanned";
  notFound: number;
  scanned: number;
  triggered: number;
  unfit: number;
  verdicts: ListingVerdict[];
}

export const scanListingsByIds = schemaTask({
  id: "scan-listings-by-ids",
  schema: scanListingsByIdsSchema,
  queue: LISTING_LEAF_QUEUE,
  machine: "micro",
  retry: {
    maxAttempts: 4,
    factor: 2,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 30_000,
    outOfMemory: { machine: "small-1x" },
  },
  catchError: scanCatchError,
  run: async (payload): Promise<ScanListingsByIdsResult> => {
    await setMachineMetadata();
    const { marketplace, listingIds } = payload;
    const config = payload.config ?? (await loadScanConfig(marketplace));
    await tags.add(marketplaceTag(marketplace));
    if (listingIds.length > config.listingScanBatchSize) {
      logger.warn(
        "Oversized manual listing batch; processing sequentially on this box",
        { marketplace, count: listingIds.length }
      );
    }
    const { verdicts, stale } = await partitionFreshListings(
      marketplace,
      listingIds,
      config
    );
    const fresh = verdicts.length;
    let scanned = 0;
    let notFound = 0;
    let personaError: Error | undefined;
    const failed: { listingId: string; message: string }[] = [];
    metadata
      .set("status", "scanning")
      .set("fresh", fresh)
      .set("stale", stale.length);
    if (stale.length > 0) {
      const manager =
        await MobileProfileTokenManager.loadForThisBox(marketplace);
      const client = await manager.createScanClient();
      metadata.set("profileId", manager.profileId);
      for (const [index, listingId] of stale.entries()) {
        await sleep(
          jitterMs(config.listingScanDelayMinMs, config.listingScanDelayMaxMs)
        );
        try {
          verdicts.push(
            await scanOneListing({
              client,
              manager,
              marketplace,
              config,
              listingId,
            })
          );
          scanned += 1;
        } catch (error) {
          if (isListingNotFound(error, marketplace)) {
            notFound += 1;
            continue;
          }
          if (isPersonaLevelError(error)) {
            personaError = await routeScanFailure(
              manager,
              error,
              stale.slice(index)
            );
            break;
          }
          const message = errorMessage(error);
          failed.push({ listingId, message });
          logger.warn("Listing check failed", {
            marketplace,
            listingId,
            message,
          });
        }
      }
    }
    await extractKeywordsForNewListings(marketplace, config, verdicts);
    metadata
      .set("scanned", scanned)
      .set("notFound", notFound)
      .set("failed", failed.length);
    if (personaError || failed.length > 0) {
      metadata.set("status", "incomplete");
      if (personaError) {
        throw personaError;
      }
      throw new ListingBatchError(marketplace, failed);
    }
    metadata.set("status", "completed");
    return {
      marketplace,
      mode: "scanned",
      triggered: listingIds.length,
      fresh,
      scanned,
      notFound,
      unfit: verdicts.filter((v) => !v.fit).length,
      verdicts,
    };
  },
});

function jitterMs(min: number, max: number): number {
  const lo = Math.max(0, min);
  return lo + Math.floor(Math.random() * (Math.max(lo, max) - lo + 1));
}
function sleep(ms: number): Promise<void> {
  return ms <= 0
    ? Promise.resolve()
    : new Promise((resolve) => {
        setTimeout(resolve, ms);
      });
}

async function extractKeywordsForNewListings(
  marketplace: string,
  config: ScanConfig,
  verdicts: ListingVerdict[]
): Promise<void> {
  const fresh: UnresolvedListing[] = [];
  for (const verdict of verdicts) {
    if (verdict.fit && verdict.isNew) {
      fresh.push({
        id: verdict.scanListingId,
        title: verdict.title,
        categoryPath: verdict.categoryPath,
      });
    }
  }
  if (fresh.length === 0) {
    return;
  }
  metadata.set("status", "extracting-keywords").set("keywordNew", fresh.length);
  try {
    // Payload marketplace, not `config.marketplace`: the listings were
    // persisted under the former, and a manual `config` override may differ.
    const totals = await resolveKeywordsWithLlm(marketplace, config, fresh);
    metadata
      .set("keywordResolvedLlm", totals.resolved)
      .set("keywordUnresolved", totals.unresolved)
      .set("keywordFailed", totals.failed)
      .set("keywordLlmSkipped", totals.llmSkipped);
    logger.info("Extracted keywords for new listings", {
      marketplace,
      newListings: fresh.length,
      ...totals,
    });
  } catch (error) {
    logger.error("Keyword extraction failed; listings left unresolved", {
      marketplace,
      newListings: fresh.length,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
