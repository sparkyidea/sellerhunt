/**
 * Seller phase task — fetch the seller record + paginate their listings.
 *
 * Marketplace-agnostic. Called by `scanListingsByKeyword` (after keyword →
 * seller discovery) or directly by the cron heartbeat (orphan catch).
 *
 * Pipeline:
 *   1. Self-gate on `scan_seller.last_scanned_at`. If fresh, exit early.
 *   2. Load bearer pool, call `client.getSeller` → upsert `scan_seller`
 *      with the storefront record (totalItemsSold, feedback, etc).
 *      Stats are required; a request failure leaves the seller incomplete.
 *   3. Walk `client.getSellerListings` until `pagination.totalPages` — the whole
 *      store, no config cap. `MAX_SELLER_PAGES` is a runaway guard only.
 *   4. Chunk the catalog into `<= K`-id batches and `batchTriggerAndWait` them
 *      over `scanListingsByIds` (one paced leaf run per chunk), waiting for all
 *      to finish — so the next seller doesn't start until this seller's listings
 *      are done. Each chunk lands on its own box/IP, spreading the catalog
 *      instead of concentrating it on this one.
 *   5. Bump `scan_seller.last_scanned_at = now` ONLY after the whole catalog has
 *      been accounted for. Partial work returns incomplete without replaying the
 *      whole tree. Global launch keys may delay cron recovery for two hours.
 */
import { db } from "@dashseller/db";
import { scanSeller } from "@dashseller/db/schema";
import { ScanRequestError } from "@dashseller/marketplace-scan/errors";
import { logger, metadata, schemaTask, tags } from "@trigger.dev/sdk";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { upsertScanSeller } from "../../nodes/scan/upsert-scan-seller";
import {
  BATCH_TRIGGER_AND_WAIT_MAX,
  batchTriggerAndWaitInWaves,
} from "../../utils/batch-trigger-and-wait-in-waves";
import { chunk } from "../../utils/chunk";
import { setMachineMetadata } from "../../utils/machine-metadata";
import { MobileProfileTokenManager } from "../../utils/mobile-profile-manager";
import { isListingBatchComplete } from "../../utils/scan-completion";
import {
  loadScanConfig,
  type ScanConfig,
  scanConfigSchema,
} from "../../utils/scan-config";
import { scanListingsByIds } from "./scan-listings-by-ids";

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
  // One seller at a time across the whole environment (keyword fan-out AND the
  // cron orphan-catch). Each run waits on all of its listings before completing,
  // so the next seller only starts once this seller's listings are done.
  queue: { concurrencyLimit: 1 },
  // Paginates a seller's listings (one page held at a time) + listing fan-out.
  // One attempt; recovery happens through a later cron launch.
  machine: "small-1x",
  retry: {
    maxAttempts: 1,
  },
  run: async (payload) => {
    await setMachineMetadata();
    const { marketplace, sellerId } = payload;

    const config = payload.config ?? (await loadScanConfig(marketplace));

    await tags.add(`scan_seller_${sellerId}`);
    await tags.add(`marketplace_${marketplace}`);
    metadata
      .set("sellerId", sellerId)
      .set("marketplace", marketplace)
      .set("status", "checking-freshness");

    if (!payload.forceRefresh) {
      const fresh = await checkSellerFreshness(marketplace, sellerId);
      if (fresh) {
        await tags.add("scan_skip_reason_fresh");
        metadata
          .set("status", "skipped-fresh")
          .set("lastScannedAt", fresh.lastScannedAt.toISOString());
        logger.info("Seller fresh; skipping scan", {
          marketplace,
          sellerId,
          lastScannedAt: fresh.lastScannedAt,
        });
        return { status: "skipped", sellerId, skipped: true, reason: "fresh" };
      }
    }

    metadata.set("status", "loading-profile");
    const manager = await MobileProfileTokenManager.loadForThisBox(marketplace);
    metadata
      .set("profileId", manager.profileId)
      .set("status", "fetching-seller");

    const client = await manager.createScanClient();

    let sellerResult: Awaited<ReturnType<typeof client.getSeller>>;
    try {
      sellerResult = await client.getSeller({ sellerId });
    } catch (error) {
      await routeFailure(manager, error);
      metadata
        .set("status", "incomplete")
        .set("reason", "seller-request-failed");
      return {
        status: "incomplete",
        sellerId,
        reason: "seller-request-failed",
      };
    }
    await manager.markUsed();

    const seller = sellerResult.seller;
    await upsertScanSeller({
      marketplace,
      reference: sellerId,
      displayName: seller.storeName ?? sellerId,
      logoUrl: seller.logoUrl,
      feedbackScore: seller.feedbackScore,
      feedbackPercent: seller.feedbackPercent,
      totalItemsSold: seller.totalItemsSold,
    });

    metadata.set("status", "paginating-listings");

    const { listingIds, complete } = await collectListingIds(
      client,
      manager,
      sellerId,
      config
    );
    metadata.set("listingsDiscovered", listingIds.size);

    metadata.set("status", "triggering-listings");
    // Chunk the catalog into `<= K`-id batches and wave over scanListingsByIds.
    // Each child is one paced leaf run (its `<= K` ids land on its own box/IP),
    // so the catalog spreads across boxes/IPs instead of all on this one.
    // Chunk by K (not the 1000 cap): a `> K` chunk would hit the launcher branch
    // and the await would settle on the fast fan-out, not on listing completion.
    const idChunks = chunk([...listingIds], config.listingScanBatchSize);
    const requestedCounts = idChunks.map((ids) => ids.length).values();
    const waveResult = await batchTriggerAndWaitInWaves(
      scanListingsByIds,
      idChunks.map((ids) => ({
        payload: { marketplace, listingIds: ids, config },
        options: {
          priority: 3600,
          tags: [`scan_seller_${sellerId}`, `marketplace_${marketplace}`],
        },
      })),
      BATCH_TRIGGER_AND_WAIT_MAX,
      // Trigger.dev returns batch results in input order, including failed runs.
      (run) => isListingBatchComplete(run, requestedCounts.next().value ?? -1)
    );

    // Incomplete coverage or missing child results require parent discovery again.
    if (
      !complete ||
      waveResult.incomplete > 0 ||
      waveResult.succeeded + waveResult.failed !== idChunks.length
    ) {
      metadata
        .set("status", "incomplete")
        .set("listingBatchesTriggered", waveResult.triggered)
        .set("listingBatchesSucceeded", waveResult.succeeded)
        .set("listingBatchesFailed", waveResult.failed)
        .set("listingBatchesIncomplete", waveResult.incomplete)
        .set("catalogComplete", complete);
      logger.warn(
        "Seller catalog incompletely scanned; leaving stale for re-pick",
        {
          marketplace,
          sellerId,
          listingsDiscovered: listingIds.size,
          ...waveResult,
        }
      );
      return {
        status: "incomplete",
        sellerId,
        listingsDiscovered: listingIds.size,
        catalogComplete: complete,
        ...waveResult,
      };
    }
    await markSellerScanned(marketplace, sellerId);

    metadata
      .set("status", "completed")
      .set("listingBatchesTriggered", waveResult.triggered)
      .set("listingBatchesSucceeded", waveResult.succeeded)
      .set("listingBatchesFailed", waveResult.failed);
    logger.info("Seller scan completed", {
      marketplace,
      sellerId,
      listingsDiscovered: listingIds.size,
      ...waveResult,
    });

    return {
      status: "completed",
      sellerId,
      listingsDiscovered: listingIds.size,
      listingBatchesTriggered: waveResult.triggered,
      listingBatchesSucceeded: waveResult.succeeded,
      listingBatchesFailed: waveResult.failed,
    };
  },
});

async function checkSellerFreshness(
  marketplace: string,
  sellerId: string
): Promise<{ lastScannedAt: Date } | null> {
  const freshUntil = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({ lastScannedAt: scanSeller.lastScannedAt })
    .from(scanSeller)
    .where(
      and(
        eq(scanSeller.marketplace, marketplace),
        eq(scanSeller.reference, sellerId)
      )
    )
    .limit(1);
  if (row?.lastScannedAt && row.lastScannedAt > freshUntil) {
    return { lastScannedAt: row.lastScannedAt };
  }
  return null;
}

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

/**
 * Runaway guard only — the real stop is `pagination.totalPages` / `hasMore`.
 * 1000 pages ≈ 48k listings; a store past that hits eBay's own result cap first.
 */
const MAX_SELLER_PAGES = 1000;

async function collectListingIds(
  client: Awaited<ReturnType<MobileProfileTokenManager["createScanClient"]>>,
  manager: MobileProfileTokenManager,
  sellerId: string,
  config: ScanConfig
): Promise<{ listingIds: Set<string>; complete: boolean }> {
  const listingIds = new Set<string>();
  for (let page = 1; page <= MAX_SELLER_PAGES; page += 1) {
    let result: Awaited<ReturnType<typeof client.getSellerListings>>;
    try {
      // Same URL-level price band + Buy It Now filter as the keyword search,
      // so a seller's catalog walk only returns in-band fixed-price listings
      // — the bulk of listing fan-out, trimmed before any detail fetch.
      result = await client.getSellerListings({
        sellerId,
        page,
        minPriceCents: config.minPriceCents,
        maxPriceCents: config.maxPriceCents,
      });
    } catch (error) {
      await routeFailure(manager, error);
      return { listingIds, complete: false };
    }
    await manager.markUsed();

    for (const listing of result.listings) {
      if (listing.listingId) {
        listingIds.add(listing.listingId);
      }
    }
    if (!result.hasMore) {
      return { listingIds, complete: true };
    }
    if (result.pagination && page >= result.pagination.totalPages) {
      return { listingIds, complete: true };
    }
  }
  logger.warn("Seller catalog walk hit the page ceiling; store truncated", {
    sellerId,
    pages: MAX_SELLER_PAGES,
    listings: listingIds.size,
  });
  return { listingIds, complete: false };
}

async function routeFailure(
  manager: MobileProfileTokenManager,
  error: unknown
): Promise<void> {
  if (error instanceof ScanRequestError && error.isAuthFailure()) {
    await manager.markDataAuthFailure(error.message);
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  await manager.markSoftFailure(message);
}
