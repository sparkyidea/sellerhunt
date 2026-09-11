/** Seller scan: successful returns account for stats, catalog, and listing children.
 * Waiting resource/queue behavior must be verified on the deployed server.
 */
import { db } from "@dashseller/db";
import { scanSeller } from "@dashseller/db/schema";
import { logger, metadata, schemaTask, tags } from "@trigger.dev/sdk";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  partitionFreshListings,
  partitionFreshSellers,
} from "../../nodes/scan/scan-freshness";
import { upsertScanSeller } from "../../nodes/scan/upsert-scan-seller";
import { waitForListingBatches } from "../../nodes/scan/wait-for-listing-batches";
import { setMachineMetadata } from "../../utils/machine-metadata";
import { MobileProfileTokenManager } from "../../utils/mobile-profile-manager";
import { assertScanEntitySupported } from "../../utils/scan-capabilities";
import { isSellerNotFound } from "../../utils/scan-completion";
import {
  loadScanConfig,
  type ScanConfig,
  scanConfigSchema,
} from "../../utils/scan-config";
import {
  routeScanFailure,
  ScanIncompleteError,
  scanCatchError,
} from "../../utils/scan-errors";
import { olderSiblingRunning } from "../../utils/scan-in-flight";
import { launchTags } from "../../utils/scan-tags";

const scanListingsBySellerSchema = z.object({
  config: scanConfigSchema.optional(),
  forceRefresh: z.boolean().optional(),
  marketplace: z.string().min(1),
  sellerId: z.string().min(1),
});
export type ScanListingsBySellerPayload = z.infer<
  typeof scanListingsBySellerSchema
>;
export const scanListingsBySeller = schemaTask({
  id: "scan-listings-by-seller",
  schema: scanListingsBySellerSchema,
  queue: { concurrencyLimit: 1 },
  machine: "small-1x",
  retry: { maxAttempts: 3 },
  catchError: scanCatchError,
  run: async (payload, { ctx }) => {
    await setMachineMetadata();
    const { marketplace, sellerId } = payload;
    assertScanEntitySupported(marketplace, "seller");
    const config = payload.config ?? (await loadScanConfig(marketplace));
    const scanTags = launchTags(marketplace, "seller", sellerId);
    await tags.add(scanTags);
    if (!payload.forceRefresh) {
      const { fresh } = await partitionFreshSellers(marketplace, [sellerId]);
      if (fresh.length > 0) {
        return { status: "skipped", sellerId, reason: "fresh" } as const;
      }
    }
    const olderRunId = await olderSiblingRunning(
      "seller",
      sellerId,
      marketplace,
      ctx.run
    );
    if (olderRunId) {
      throw new ScanIncompleteError("in-flight", { sellerId, olderRunId });
    }
    const manager = await MobileProfileTokenManager.loadForThisBox(marketplace);
    const client = await manager.createScanClient();
    let result: Awaited<ReturnType<typeof client.getSeller>>;
    try {
      result = await client.getSeller({ sellerId });
    } catch (error) {
      if (isSellerNotFound(error, marketplace)) {
        await manager.markUsed();
        // Manual missing sellers may not have a row yet.
        await upsertScanSeller({ marketplace, reference: sellerId });
        await markSellerScanned(marketplace, sellerId);
        return { status: "skipped", sellerId, reason: "seller-gone" } as const;
      }
      throw await routeScanFailure(manager, error);
    }
    await manager.markUsed();
    const seller = result.seller;
    await upsertScanSeller({
      marketplace,
      reference: sellerId,
      displayName: seller.storeName ?? sellerId,
      logoUrl: seller.logoUrl,
      feedbackScore: seller.feedbackScore,
      feedbackPercent: seller.feedbackPercent,
      totalItemsSold: seller.totalItemsSold,
    });
    const catalog = await collectListingIds(client, manager, sellerId, config);
    const { verdicts, stale } = await partitionFreshListings(
      marketplace,
      [...catalog.listingIds],
      config
    );
    const children = await waitForListingBatches(
      marketplace,
      stale,
      config,
      scanTags
    );
    metadata
      .set("listingsDiscovered", catalog.listingIds.size)
      .set("listingsFresh", verdicts.length)
      .set("listingBatches", children.batches);
    if (catalog.error) {
      throw catalog.error;
    }
    if (!catalog.complete || children.failed > 0) {
      throw new ScanIncompleteError("catalog-incomplete", {
        sellerId,
        catalogComplete: catalog.complete,
        failedBatches: children.failed,
      });
    }
    await markSellerScanned(marketplace, sellerId);
    metadata.set("status", "completed");
    return {
      status: "completed",
      sellerId,
      listingsDiscovered: catalog.listingIds.size,
      listingsFresh: verdicts.length,
      listingBatches: children.batches,
    } as const;
  },
});

async function markSellerScanned(
  marketplace: string,
  sellerId: string
): Promise<void> {
  await db
    .update(scanSeller)
    .set({ lastScannedAt: new Date() })
    .where(
      and(
        eq(scanSeller.marketplace, marketplace),
        eq(scanSeller.reference, sellerId)
      )
    );
}
const MAX_SELLER_PAGES = 1000;
async function collectListingIds(
  client: Awaited<ReturnType<MobileProfileTokenManager["createScanClient"]>>,
  manager: MobileProfileTokenManager,
  sellerId: string,
  config: ScanConfig
): Promise<{ listingIds: Set<string>; complete: boolean; error?: Error }> {
  const listingIds = new Set<string>();
  for (let page = 1; page <= MAX_SELLER_PAGES; page += 1) {
    let result: Awaited<ReturnType<typeof client.getSellerListings>>;
    try {
      result = await client.getSellerListings({
        sellerId,
        page,
        minPriceCents: config.minPriceCents,
        maxPriceCents: config.maxPriceCents,
      });
    } catch (error) {
      return {
        listingIds,
        complete: false,
        error: await routeScanFailure(manager, error),
      };
    }
    await manager.markUsed();
    for (const listing of result.listings) {
      if (listing.listingId) {
        listingIds.add(listing.listingId);
      }
    }
    if (
      !result.hasMore ||
      (result.pagination && page >= result.pagination.totalPages)
    ) {
      return { listingIds, complete: true };
    }
  }
  logger.warn("Seller catalog hit page ceiling", {
    sellerId,
    pages: MAX_SELLER_PAGES,
  });
  return { listingIds, complete: false };
}
