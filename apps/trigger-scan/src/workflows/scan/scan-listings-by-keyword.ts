/**
 * Keyword phase task — surface candidate listings via the search endpoint.
 *
 * Marketplace-agnostic. The cron heartbeat fires this with `marketplace` set;
 * the bearer pool + adapter both dispatch on that string.
 *
 * Pipeline:
 *   1. Self-gate on `scan_keyword.last_scanned_at`. If fresh, exit early.
 *      Cron and direct triggers can both call this; the gate prevents
 *      double-scans without coordination.
 *   2. Load bearer pool, call `client.searchListings` once per page until
 *      `pagination.hasMore = false` or `maxSearchPages` is hit.
 *   3. Collect EVERY listing id from the search cards (deduped). We no longer
 *      trust the card's "X sold" badge — it's unreliable (understated/recent).
 *      The real condition is judged downstream by `scanListingsByIds`, which
 *      fetches authoritative detail and returns whether each listing fit.
 *   4. Validate in `<= K` batches — `triggerAndWait scanListingsByIds` per chunk
 *      (one paced leaf run, verdicts back), and for each listing that fits,
 *      fire-and-forget its `scanListingsBySeller` (deduped). Chunks are awaited
 *      sequentially (one waitpoint at a time); sellers run one-at-a-time on their
 *      own `concurrencyLimit: 1` queue.
 *   5. Bump `scan_keyword.last_scanned_at = now` ONLY after every listing has
 *      been validated and its seller fired. If any batch crashed or aborted on a
 *      throttled persona, the run throws instead — a failed run clears the
 *      launcher's per-keyword idempotency key, leaving the keyword stale so the
 *      cron re-picks it next tick.
 */
import { db } from "@dashseller/db";
import { scanKeyword } from "@dashseller/db/schema";
import { ScanRequestError } from "@dashseller/marketplace-scan/errors";
import { logger, metadata, tags, task } from "@trigger.dev/sdk";
import { and, eq } from "drizzle-orm";
import type { ListingVerdict } from "../../nodes/scan/scan-one-listing";
import { markKeywordScanned } from "../../nodes/scan/upsert-scan-keyword";
import { chunk } from "../../utils/chunk";
import { setMachineMetadata } from "../../utils/machine-metadata";
import { MobileProfileTokenManager } from "../../utils/mobile-profile-manager";
import { loadScanConfig, type ScanConfig } from "../../utils/scan-config";
import { scanListingsByIds } from "./scan-listings-by-ids";
import { scanListingsBySeller } from "./scan-listings-by-seller";

type ScanClient = Awaited<
  ReturnType<MobileProfileTokenManager["createScanClient"]>
>;

export interface ScanListingsByKeywordPayload {
  /** Pre-loaded config; cron fills this so child tasks don't re-fetch. */
  config?: ScanConfig;
  /** Bypass the freshness self-gate. */
  forceRefresh?: boolean;
  /** Search query (single keyword per task). */
  keyword: string;
  marketplace: string;
}

export const scanListingsByKeyword = task({
  id: "scan-listings-by-keyword",
  // One keyword at a time — serializes the rate-limited search pagination, then
  // the run holds through a serial batched-validation loop (one waitpoint at a
  // time; see `validateAndPromoteSellers`).
  queue: { concurrencyLimit: 1 },
  // Holds one search page, then validates listings in `<= K` batches via
  // `triggerAndWait scanListingsByIds`. Self-hosted has no checkpoints, so each
  // wait HOLDS this box — but it's one waitpoint at a time, and batching cuts the
  // number of waits from N to ceil(N/K). micro; escalates on OOM.
  machine: "micro",
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 30_000,
    outOfMemory: { machine: "small-1x" },
  },
  run: async (payload: ScanListingsByKeywordPayload) => {
    await setMachineMetadata();
    const { marketplace, keyword } = payload;
    if (!keyword) {
      throw new Error("scanListingsByKeyword: payload.keyword is required");
    }
    if (!marketplace) {
      throw new Error("scanListingsByKeyword: payload.marketplace is required");
    }

    const config = payload.config ?? (await loadScanConfig(marketplace));

    await tags.add(`scan_keyword_${keyword}`);
    await tags.add(`marketplace_${marketplace}`);
    metadata
      .set("keyword", keyword)
      .set("marketplace", marketplace)
      .set("status", "checking-freshness");

    if (!payload.forceRefresh) {
      const fresh = await checkKeywordFreshness(
        marketplace,
        keyword,
        config.keywordRescanAfter
      );
      if (fresh) {
        await tags.add("scan_skip_reason_fresh");
        metadata
          .set("status", "skipped-fresh")
          .set("lastScannedAt", fresh.lastScannedAt.toISOString());
        logger.info("Keyword fresh; skipping scan", {
          marketplace,
          keyword,
          lastScannedAt: fresh.lastScannedAt,
        });
        return { keyword, skipped: true, reason: "fresh" };
      }
    }

    metadata.set("status", "loading-profile");
    const manager = await MobileProfileTokenManager.loadForThisBox(marketplace);
    metadata.set("profileId", manager.profileId).set("status", "paginating");

    const client = await manager.createScanClient();
    const { listingIds, cardsSeen } = await paginateListingIds(
      client,
      manager,
      keyword,
      config
    );
    metadata
      .set("cardsSeen", cardsSeen)
      .set("listingsDiscovered", listingIds.size);

    metadata.set("status", "validating");
    const { sellersFired, incompleteBatches } = await validateAndPromoteSellers(
      listingIds,
      marketplace,
      config
    );

    // Mark scanned ONLY when every discovered listing was actually scanned. If a
    // batch crashed or aborted on a throttled/blocked persona, its ids were never
    // persisted to `scan_listing` (they lived only in this run's memory), so the
    // listing orphan-catch can't recover them. Throw instead of marking: a failed
    // run clears the launcher's per-keyword idempotency key (successful runs hold
    // it for the rescan-window TTL), so the next cron tick re-picks this
    // still-stale keyword on fresh boxes.
    if (incompleteBatches > 0) {
      metadata
        .set("status", "incomplete")
        .set("sellersFired", sellersFired)
        .set("incompleteBatches", incompleteBatches);
      logger.warn("Keyword incompletely scanned; leaving stale for re-pick", {
        marketplace,
        keyword,
        listingsDiscovered: listingIds.size,
        sellersFired,
        incompleteBatches,
      });
      throw new Error(
        `scanListingsByKeyword: ${incompleteBatches} listing batch(es) failed or aborted for keyword="${keyword}"; leaving stale for re-pick`
      );
    }
    await markKeywordScanned(marketplace, keyword);

    metadata.set("status", "completed").set("sellersFired", sellersFired);
    logger.info("Keyword scan completed", {
      marketplace,
      keyword,
      listingsDiscovered: listingIds.size,
      sellersFired,
    });

    return { keyword, listingsDiscovered: listingIds.size, sellersFired };
  },
});

/** Paginate the keyword search, collecting every (deduped) listing id. */
async function paginateListingIds(
  client: ScanClient,
  manager: MobileProfileTokenManager,
  keyword: string,
  config: ScanConfig
): Promise<{ listingIds: Set<string>; cardsSeen: number }> {
  const listingIds = new Set<string>();
  let cardsSeen = 0;

  for (let page = 1; page <= config.maxSearchPages; page += 1) {
    let result: Awaited<ReturnType<typeof client.searchListings>>;
    try {
      // Price band + Buy It Now are pushed into the search URL so eBay narrows
      // results server-side — out-of-band / auction listings never reach here.
      result = await client.searchListings({
        keyword,
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
      cardsSeen += 1;
      if (listing.listingId) {
        listingIds.add(listing.listingId);
      }
    }
    if (!result.hasMore) {
      break;
    }
  }

  return { listingIds, cardsSeen };
}

/**
 * Validate listings in `<= K` batches and, for each that fits, fire-and-forget
 * its seller scan. Each chunk is one paced `scanListingsByIds` leaf run that
 * returns its verdicts; chunks are awaited sequentially, so the keyword run
 * holds only one waitpoint at a time. Chunk by K (the leaf threshold) so each
 * child hits the leaf branch and returns verdicts — a `> K` chunk would fan out
 * and come back empty. Returns how many distinct sellers were fired. In-run
 * `Set` dedup + the seller idempotency key keep the seller queue from flooding.
 */
async function validateAndPromoteSellers(
  listingIds: Set<string>,
  marketplace: string,
  config: ScanConfig
): Promise<{ sellersFired: number; incompleteBatches: number }> {
  const firedSellers = new Set<string>();
  let incompleteBatches = 0;

  for (const ids of chunk([...listingIds], config.listingScanBatchSize)) {
    const run = await scanListingsByIds.triggerAndWait({
      marketplace,
      listingIds: ids,
      config,
    });
    // A batch is "complete" only when the leaf ran inline AND scanned every id.
    // `!run.ok` (child crashed after retries) and `aborted` (persona throttle
    // stopped it partway) both leave ids unscanned — and unpersisted, so the
    // listing orphan-catch can't see them. Tally those so the caller can keep the
    // keyword stale instead of marking it fully scanned.
    if (!run.ok || run.output.mode !== "scanned" || run.output.aborted) {
      incompleteBatches += 1;
    }
    // Promote whatever DID scan — an aborted batch still carries partial verdicts.
    if (run.ok && run.output.mode === "scanned") {
      for (const verdict of run.output.verdicts) {
        await promoteSeller(verdict, marketplace, config, firedSellers);
      }
    }
  }

  return { sellersFired: firedSellers.size, incompleteBatches };
}

/** Fire a seller scan for a fitting listing, deduped within this keyword run. */
async function promoteSeller(
  verdict: ListingVerdict,
  marketplace: string,
  config: ScanConfig,
  firedSellers: Set<string>
): Promise<void> {
  const { fit, sellerReference } = verdict;
  if (!(fit && sellerReference) || firedSellers.has(sellerReference)) {
    return;
  }
  firedSellers.add(sellerReference);
  await scanListingsBySeller.trigger(
    { marketplace, sellerId: sellerReference, config },
    {
      idempotencyKey: ["seller", marketplace, sellerReference],
      idempotencyKeyTTL: `${config.sellerRescanAfter}m`,
      tags: [`scan_seller_${sellerReference}`, `marketplace_${marketplace}`],
    }
  );
}

async function checkKeywordFreshness(
  marketplace: string,
  keyword: string,
  rescanAfter: number
): Promise<{ lastScannedAt: Date } | null> {
  if (rescanAfter <= 0) {
    return null;
  }
  const freshUntil = new Date(Date.now() - rescanAfter * 60_000);
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
  if (row?.lastScannedAt && row.lastScannedAt > freshUntil) {
    return { lastScannedAt: row.lastScannedAt };
  }
  return null;
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
