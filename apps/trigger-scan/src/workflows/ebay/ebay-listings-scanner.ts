/**
 * eBay scanner cron heartbeat.
 *
 * Runs on a schedule, picks stale entities (keywords + sellers + listings)
 * for marketplace = "ebay", and `batchTrigger`s the marketplace-agnostic
 * phase tasks under `workflows/scan/`. Keywords and sellers self-gate on
 * freshness; listings always fetch supplied IDs. Global launch keys suppress
 * duplicate keyword/seller runs across parents and ticks for two hours.
 *
 * Three independent fan-outs per tick (keyword + listing go through the plural
 * bulk launchers, which fan out to the singular single-action tasks):
 *   - keywords → `scanListingsByKeywords` (bulk → entry point, discovers sellers)
 *   - sellers  → `scanListingsBySeller` (orphan catch — sellers found by
 *                listing-detail upserts that don't have a syncing scan yet)
 *   - listings → `scanListingsByIds` (bulk → orphan catch for listings discovered
 *                by a search/seller scan whose subsequent fan-out failed mid-air)
 *
 * The orphan catches matter for resilience: when any fan-out drops a child
 * task (mid-deploy, OOM, queue overflow), the next tick re-discovers the
 * stale entity and re-fires.
 *
 * `enabled = false` on `scan_config` exits early — admin kill switch.
 */
import { db } from "@dashseller/db";
import { scanKeyword, scanListing, scanSeller } from "@dashseller/db/schema";
import { logger, metadata, schedules } from "@trigger.dev/sdk/v3";
import { and, asc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { setMachineMetadata } from "../../utils/machine-metadata";
import { loadScanConfig } from "../../utils/scan-config";
import { scanLaunchOptions } from "../../utils/scan-launch-options";
import { scanListingsByIds } from "../scan/scan-listings-by-ids";
import { scanListingsByKeywords } from "../scan/scan-listings-by-keywords";
import { scanListingsBySeller } from "../scan/scan-listings-by-seller";

const MARKETPLACE = "ebay";

export const ebayListingsScanner = schedules.task({
  id: "ebay-listings-scanner",
  // Pure orchestration: DB freshness queries + batchTrigger fan-out, no
  // marketplace HTTP and no large payloads. Runs on micro; escalates to
  // small-1x only if an unusually large fan-out batch blows the cap.
  machine: "micro",
  retry: {
    maxAttempts: 1,
    factor: 1.5,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 5000,
    outOfMemory: { machine: "small-1x" },
  },
  run: async (payload) => {
    await setMachineMetadata();
    metadata.set("marketplace", MARKETPLACE).set("status", "loading-config");

    const config = await loadScanConfig(MARKETPLACE);
    if (!config.enabled) {
      metadata.set("status", "disabled");
      logger.info("Scanner disabled for marketplace", {
        marketplace: MARKETPLACE,
      });
      return { marketplace: MARKETPLACE, skipped: true, reason: "disabled" };
    }

    metadata
      .set("status", "picking-stale")
      .set("scheduledAt", payload.timestamp.toISOString());

    const [staleKeywords, staleSellers, staleListings] = await Promise.all([
      pickStaleKeywords(
        MARKETPLACE,
        config.keywordRescanAfter,
        config.keywordBatchSize
      ),
      pickStaleSellers(
        MARKETPLACE,
        config.sellerRescanAfter,
        config.sellerBatchSize
      ),
      pickStaleListings(
        MARKETPLACE,
        config.listingRescanAfter,
        config.listingBatchSize
      ),
    ]);

    metadata
      .set("staleKeywords", staleKeywords.length)
      .set("staleSellers", staleSellers.length)
      .set("staleListings", staleListings.length)
      .set("status", "fanning-out");

    await Promise.all([
      // Keywords + orphan listings go through the bulk launchers (one trigger
      // each, the bulk fans out). Sellers have no bulk task, so the cron is
      // their launcher — batchTrigger one run per stale seller.
      staleKeywords.length > 0
        ? scanListingsByKeywords.trigger({
            marketplace: MARKETPLACE,
            keywords: staleKeywords,
            config,
          })
        : Promise.resolve(null),
      staleSellers.length > 0
        ? scanListingsBySeller.batchTrigger(
            await Promise.all(
              staleSellers.map(async (sellerId) => ({
                payload: { marketplace: MARKETPLACE, sellerId, config },
                options: await scanLaunchOptions(
                  "seller",
                  MARKETPLACE,
                  sellerId
                ),
              }))
            )
          )
        : Promise.resolve(null),
      staleListings.length > 0
        ? scanListingsByIds.trigger({
            marketplace: MARKETPLACE,
            listingIds: staleListings,
            config,
          })
        : Promise.resolve(null),
    ]);

    metadata.set("status", "completed");
    logger.info("Scanner tick completed", {
      marketplace: MARKETPLACE,
      keywordsTriggered: staleKeywords.length,
      sellersTriggered: staleSellers.length,
      listingsTriggered: staleListings.length,
    });

    return {
      marketplace: MARKETPLACE,
      keywordsTriggered: staleKeywords.length,
      sellersTriggered: staleSellers.length,
      listingsTriggered: staleListings.length,
    };
  },
});

async function pickStaleKeywords(
  marketplace: string,
  rescanAfter: number,
  batchSize: number
): Promise<string[]> {
  const freshUntil = new Date(Date.now() - rescanAfter * 60_000);
  const rows = await db
    .select({ keyword: scanKeyword.keyword })
    .from(scanKeyword)
    .where(
      and(
        eq(scanKeyword.marketplace, marketplace),
        isNull(scanKeyword.deadAt),
        or(
          isNull(scanKeyword.lastScannedAt),
          lt(scanKeyword.lastScannedAt, freshUntil)
        )
      )
    )
    .orderBy(sql`${scanKeyword.lastScannedAt} ASC NULLS FIRST`)
    .limit(batchSize);
  return rows.map((r) => r.keyword);
}

async function pickStaleSellers(
  marketplace: string,
  rescanAfter: number,
  batchSize: number
): Promise<string[]> {
  const freshUntil = new Date(Date.now() - rescanAfter * 60_000);
  const rows = await db
    .select({ reference: scanSeller.reference })
    .from(scanSeller)
    .where(
      and(
        eq(scanSeller.marketplace, marketplace),
        or(
          isNull(scanSeller.lastScannedAt),
          lt(scanSeller.lastScannedAt, freshUntil)
        )
      )
    )
    .orderBy(
      sql`${scanSeller.lastScannedAt} ASC NULLS FIRST`,
      asc(scanSeller.id)
    )
    .limit(batchSize);
  return rows.map((r) => r.reference);
}

async function pickStaleListings(
  marketplace: string,
  rescanAfter: number,
  batchSize: number
): Promise<string[]> {
  const freshUntil = new Date(Date.now() - rescanAfter * 60_000);
  const rows = await db
    .select({ reference: scanListing.reference })
    .from(scanListing)
    .where(
      and(
        eq(scanListing.marketplace, marketplace),
        or(
          isNull(scanListing.lastScannedAt),
          lt(scanListing.lastScannedAt, freshUntil)
        )
      )
    )
    .orderBy(
      sql`${scanListing.lastScannedAt} ASC NULLS FIRST`,
      asc(scanListing.id)
    )
    .limit(batchSize);
  return rows.map((r) => r.reference);
}
