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
 *      Best-effort — even if fields are null, the listing fan-out still runs.
 *   3. Walk `client.getSellerListings` until `pagination.totalPages` — the whole
 *      store, no config cap. `MAX_SELLER_PAGES` is a runaway guard only.
 *   4. Chunk the catalog into `<= K`-id batches and `batchTriggerAndWait` them
 *      over `scanListingsByIds` (one paced leaf run per chunk), waiting for all
 *      to finish — so the next seller doesn't start until this seller's listings
 *      are done. Each chunk lands on its own box/IP, spreading the catalog
 *      instead of concentrating it on this one.
 *   5. Bump `scan_seller.last_scanned_at = now` ONLY after the whole catalog has
 *      been scanned. If any batch crashed or aborted on a throttled persona, the
 *      run throws instead — a failed run clears the per-seller idempotency key,
 *      leaving the seller stale so the cron re-picks it next tick. (That key,
 *      scoped to the rescan window, keeps the cron from re-enqueuing a
 *      still-running seller; a completed run holds it for the full window.)
 */
import { db } from "@dashseller/db";
import { scanSeller } from "@dashseller/db/schema";
import { ScanRequestError } from "@dashseller/marketplace-scan/errors";
import { logger, metadata, tags, task } from "@trigger.dev/sdk";
import { and, eq } from "drizzle-orm";
import { upsertScanSeller } from "../../nodes/scan/upsert-scan-seller";
import {
  BATCH_TRIGGER_AND_WAIT_MAX,
  batchTriggerAndWaitInWaves,
} from "../../utils/batch-trigger-and-wait-in-waves";
import { chunk } from "../../utils/chunk";
import { setMachineMetadata } from "../../utils/machine-metadata";
import { MobileProfileTokenManager } from "../../utils/mobile-profile-manager";
import { loadScanConfig, type ScanConfig } from "../../utils/scan-config";
import { scanListingsByIds } from "./scan-listings-by-ids";

export interface ScanListingsBySellerPayload {
  config?: ScanConfig;
  forceRefresh?: boolean;
  marketplace: string;
  sellerId: string;
}

export const scanListingsBySeller = task({
  id: "scan-listings-by-seller",
  // One seller at a time across the whole environment (keyword fan-out AND the
  // cron orphan-catch). Each run waits on all of its listings before completing,
  // so the next seller only starts once this seller's listings are done.
  queue: { concurrencyLimit: 1 },
  // Paginates a seller's listings (one page held at a time) + listing fan-out.
  // small-1x baseline; escalates to small-2x for sellers with very large
  // catalogs / heavy pages.
  machine: "small-1x",
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 30_000,
    outOfMemory: { machine: "small-2x" },
  },
  run: async (payload: ScanListingsBySellerPayload) => {
    await setMachineMetadata();
    const { marketplace, sellerId } = payload;
    if (!sellerId) {
      throw new Error("scanListingsBySeller: payload.sellerId is required");
    }
    if (!marketplace) {
      throw new Error("scanListingsBySeller: payload.marketplace is required");
    }

    const config = payload.config ?? (await loadScanConfig(marketplace));

    await tags.add(`scan_seller_${sellerId}`);
    await tags.add(`marketplace_${marketplace}`);
    metadata
      .set("sellerId", sellerId)
      .set("marketplace", marketplace)
      .set("status", "checking-freshness");

    if (!payload.forceRefresh) {
      const fresh = await checkSellerFreshness(
        marketplace,
        sellerId,
        config.sellerRescanAfter
      );
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
        return { sellerId, skipped: true, reason: "fresh" };
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
      throw error;
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

    const listingIds = await collectListingIds(
      client,
      manager,
      sellerId,
      config
    );
    metadata.set("listingsDiscovered", listingIds.size);

    if (listingIds.size === 0) {
      await markSellerScanned(marketplace, sellerId);
      metadata.set("status", "completed");
      return {
        sellerId,
        listingsDiscovered: 0,
        listingBatchesTriggered: 0,
        listingBatchesSucceeded: 0,
        listingBatchesFailed: 0,
      };
    }

    metadata.set("status", "triggering-listings");
    // Chunk the catalog into `<= K`-id batches and wave over scanListingsByIds.
    // Each child is one paced leaf run (its `<= K` ids land on its own box/IP),
    // so the catalog spreads across boxes/IPs instead of all on this one.
    // Chunk by K (not the 1000 cap): a `> K` chunk would hit the launcher branch
    // and the await would settle on the fast fan-out, not on listing completion.
    const idChunks = chunk([...listingIds], config.listingScanBatchSize);
    const waveResult = await batchTriggerAndWaitInWaves(
      scanListingsByIds,
      idChunks.map((ids) => ({
        payload: { marketplace, listingIds: ids, config },
        options: {
          tags: [`scan_seller_${sellerId}`, `marketplace_${marketplace}`],
        },
      })),
      BATCH_TRIGGER_AND_WAIT_MAX,
      // A leaf is "complete" only if it ran inline AND scanned every id. A crash
      // (`!ok`) or a persona-abort (`aborted` — the run finishes OK) leaves ids
      // unscanned+unpersisted, which the listing orphan-catch can't see.
      (run) => run.ok && run.output.mode === "scanned" && !run.output.aborted
    );

    // Mark scanned only when the WHOLE catalog was scanned. If any batch crashed
    // or aborted, some listing ids were never persisted (they existed only in
    // this run's memory), so the listing orphan-catch can't recover them. Throw
    // instead of marking: a failed run clears the cron's per-seller idempotency
    // key (a successful run holds it for the rescan-window TTL), so the next tick
    // re-picks this still-stale seller on fresh boxes.
    if (waveResult.incomplete > 0) {
      metadata
        .set("status", "incomplete")
        .set("listingBatchesTriggered", waveResult.triggered)
        .set("listingBatchesSucceeded", waveResult.succeeded)
        .set("listingBatchesFailed", waveResult.failed)
        .set("listingBatchesIncomplete", waveResult.incomplete);
      logger.warn(
        "Seller catalog incompletely scanned; leaving stale for re-pick",
        {
          marketplace,
          sellerId,
          listingsDiscovered: listingIds.size,
          ...waveResult,
        }
      );
      throw new Error(
        `scanListingsBySeller: ${waveResult.incomplete}/${waveResult.triggered} listing batch(es) failed or aborted for seller="${sellerId}"; leaving stale for re-pick`
      );
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
  sellerId: string,
  rescanAfter: number
): Promise<{ lastScannedAt: Date } | null> {
  if (rescanAfter <= 0) {
    return null;
  }
  const freshUntil = new Date(Date.now() - rescanAfter * 60_000);
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
): Promise<Set<string>> {
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
      throw error;
    }
    await manager.markUsed();

    for (const listing of result.listings) {
      if (listing.listingId) {
        listingIds.add(listing.listingId);
      }
    }
    if (!result.hasMore) {
      return listingIds;
    }
    if (result.pagination && page >= result.pagination.totalPages) {
      return listingIds;
    }
  }
  logger.warn("Seller catalog walk hit the page ceiling; store truncated", {
    sellerId,
    pages: MAX_SELLER_PAGES,
    listings: listingIds.size,
  });
  return listingIds;
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
