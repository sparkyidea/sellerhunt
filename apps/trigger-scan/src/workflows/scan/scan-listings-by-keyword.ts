/** Keyword scan waits for its listing checks and every required seller.
 * Active dependencies are incomplete until freshness or child completion proves otherwise.
 */
import { db } from "@dashseller/db";
import { scanKeyword } from "@dashseller/db/schema";
import { logger, metadata, schemaTask, tags } from "@trigger.dev/sdk";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { ListingVerdict } from "../../nodes/scan/listing-verdict";
import {
  partitionFreshListings,
  partitionFreshSellers,
} from "../../nodes/scan/scan-freshness";
import {
  markKeywordScanned,
  registerScanKeywords,
} from "../../nodes/scan/upsert-scan-keyword";
import { waitForListingBatches } from "../../nodes/scan/wait-for-listing-batches";
import { setMachineMetadata } from "../../utils/machine-metadata";
import { MobileProfileTokenManager } from "../../utils/mobile-profile-manager";
import { batchWaves } from "../../utils/scan-batch";
import { assertScanEntitySupported } from "../../utils/scan-capabilities";
import {
  loadScanConfig,
  type ScanConfig,
  scanConfigSchema,
} from "../../utils/scan-config";
import { freshnessCutoff } from "../../utils/scan-cooldowns";
import {
  isInFlightFailure,
  routeScanFailure,
  ScanIncompleteError,
  scanCatchError,
} from "../../utils/scan-errors";
import { inFlight, olderSiblingRunning } from "../../utils/scan-in-flight";
import { launchTags } from "../../utils/scan-tags";
import { scanListingsBySeller } from "./scan-listings-by-seller";

const scanListingsByKeywordSchema = z.object({
  config: scanConfigSchema.optional(),
  forceRefresh: z.boolean().optional(),
  marketplace: z.string().min(1),
  keyword: z.string().min(1),
});
export type ScanListingsByKeywordPayload = z.infer<
  typeof scanListingsByKeywordSchema
>;
export const scanListingsByKeyword = schemaTask({
  id: "scan-listings-by-keyword",
  schema: scanListingsByKeywordSchema,
  queue: { concurrencyLimit: 1 },
  machine: "micro",
  retry: { maxAttempts: 3 },
  catchError: scanCatchError,
  run: async (payload, { ctx }) => {
    const { marketplace, keyword } = payload;
    assertScanEntitySupported(marketplace, "keyword");
    await registerScanKeywords(marketplace, [keyword]);
    await setMachineMetadata();
    const config = payload.config ?? (await loadScanConfig(marketplace));
    const scanTags = launchTags(marketplace, "keyword", keyword);
    await tags.add(scanTags);
    if (!payload.forceRefresh && (await keywordFresh(marketplace, keyword))) {
      return { status: "skipped", keyword, reason: "fresh" } as const;
    }
    const olderRunId = await olderSiblingRunning(
      "keyword",
      keyword,
      marketplace,
      ctx.run
    );
    if (olderRunId) {
      throw new ScanIncompleteError("in-flight", { keyword, olderRunId });
    }
    const manager = await MobileProfileTokenManager.loadForThisBox(marketplace);
    const client = await manager.createScanClient();
    const search = await paginateListingIds(client, manager, keyword, config);
    const { verdicts, stale } = await partitionFreshListings(
      marketplace,
      [...search.listingIds],
      config
    );
    const children = await waitForListingBatches(
      marketplace,
      stale,
      config,
      scanTags
    );
    const sellers = await launchSellers(
      [...verdicts, ...children.verdicts],
      marketplace,
      config
    );
    metadata
      .set("listingsDiscovered", search.listingIds.size)
      .set("listingsFresh", verdicts.length)
      .set("sellersDeferred", sellers.deferred);
    if (search.error) {
      throw search.error;
    }
    if (children.failed > 0 || sellers.failed > 0 || sellers.lookupFailed) {
      throw new ScanIncompleteError("children-incomplete", {
        keyword,
        failedListingBatches: children.failed,
        ...sellers,
      });
    }
    if (sellers.deferred.length > 0) {
      throw new ScanIncompleteError("in-flight", {
        keyword,
        sellersDeferred: sellers.deferred,
      });
    }
    await markKeywordScanned(marketplace, keyword);
    metadata.set("status", "completed");
    return {
      status: "completed",
      keyword,
      listingsDiscovered: search.listingIds.size,
      listingsFresh: verdicts.length,
      sellersLaunched: sellers.launched,
      sellersSkippedFresh: sellers.fresh,
    } as const;
  },
});

async function paginateListingIds(
  client: Awaited<ReturnType<MobileProfileTokenManager["createScanClient"]>>,
  manager: MobileProfileTokenManager,
  keyword: string,
  config: ScanConfig
): Promise<{ listingIds: Set<string>; error?: Error }> {
  const listingIds = new Set<string>();
  for (let page = 1; page <= config.maxSearchPages; page += 1) {
    let result: Awaited<ReturnType<typeof client.searchListings>>;
    try {
      result = await client.searchListings({
        keyword,
        page,
        minPriceCents: config.minPriceCents,
        maxPriceCents: config.maxPriceCents,
      });
    } catch (error) {
      return { listingIds, error: await routeScanFailure(manager, error) };
    }
    await manager.markUsed();
    for (const listing of result.listings) {
      if (listing.listingId) {
        listingIds.add(listing.listingId);
      }
    }
    if (!result.hasMore) {
      break;
    }
  }
  return { listingIds };
}

async function launchSellers(
  verdicts: ListingVerdict[],
  marketplace: string,
  config: ScanConfig
) {
  const candidates = new Set<string>();
  for (const verdict of verdicts) {
    if (verdict.fit && verdict.sellerReference) {
      candidates.add(verdict.sellerReference);
    }
  }
  const { fresh, stale } = await partitionFreshSellers(marketplace, [
    ...candidates,
  ]);
  const result = {
    fresh: fresh.length,
    launched: 0,
    failed: 0,
    lookupFailed: false,
    deferred: [] as string[],
  };
  if (stale.length === 0) {
    return result;
  }
  let running: Set<string>;
  try {
    running = await inFlight("seller", marketplace);
  } catch (error) {
    logger.warn("Cannot determine seller dependency coverage", {
      marketplace,
      error,
    });
    result.lookupFailed = true;
    return result;
  }
  const busy = new Set(stale.filter((reference) => running.has(reference)));
  for (const wave of batchWaves(
    stale.filter((reference) => !running.has(reference))
  )) {
    try {
      const batch = await scanListingsBySeller.batchTriggerAndWait(
        wave.map((sellerId) => ({
          payload: { marketplace, sellerId, config },
          options: { tags: launchTags(marketplace, "seller", sellerId) },
        }))
      );
      result.launched += wave.length;
      for (const [index, run] of batch.runs.entries()) {
        if (run.ok) {
          continue;
        }
        const reference = wave[index];
        if (isInFlightFailure(run.error) && reference) {
          busy.add(reference);
        } else {
          result.failed += 1;
        }
      }
      result.failed += Math.max(0, wave.length - batch.runs.length);
    } catch (error) {
      result.failed += wave.length;
      logger.warn("Seller batch handoff failed", { marketplace, error });
    }
  }
  // A busy seller may have completed while healthy siblings ran. Only persisted
  // completion can discharge that dependency; run-list visibility is insufficient.
  if (busy.size > 0) {
    const checked = await partitionFreshSellers(marketplace, [...busy]);
    result.deferred = checked.stale;
    result.fresh += checked.fresh.length;
  }
  return result;
}

async function keywordFresh(
  marketplace: string,
  keyword: string
): Promise<boolean> {
  const [row] = await db
    .select({ lastScannedAt: scanKeyword.lastScannedAt })
    .from(scanKeyword)
    .where(
      and(
        eq(scanKeyword.marketplace, marketplace),
        eq(scanKeyword.keyword, keyword)
      )
    )
    .limit(1);
  return !!row?.lastScannedAt && row.lastScannedAt > freshnessCutoff("keyword");
}
