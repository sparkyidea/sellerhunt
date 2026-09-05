/**
 * Marketplace-wide heartbeat with inline per-entity cooldowns. One schedule
 * sweeps every enabled `scan_config` row for listings, then sellers, then
 * keywords, and launches an entity only where the marketplace adapter
 * implements it (`supportsScanEntity`); shop serves listing detail only today,
 * so its keyword and seller sweeps report `unsupported`.
 */
import { db } from "@dashseller/db";
import { scanKeyword, scanListing, scanSeller } from "@dashseller/db/schema";
import { logger, metadata, schedules } from "@trigger.dev/sdk";
import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { setMachineMetadata } from "../../utils/machine-metadata";
import {
  type ScanEntity,
  supportsScanEntity,
} from "../../utils/scan-capabilities";
import { loadAllScanConfigs, type ScanConfig } from "../../utils/scan-config";
import { scanLaunchOptions } from "../../utils/scan-launch-options";
import { scanListingsByIds } from "./scan-listings-by-ids";
import { scanListingsByKeywords } from "./scan-listings-by-keywords";
import { scanListingsBySeller } from "./scan-listings-by-seller";

/**
 * Sweep order within one tick and the cooldown per entity. Listings go first so
 * they enqueue ahead of sellers and keywords, matching the run priorities.
 */
const SWEEPS: ReadonlyArray<readonly [ScanEntity, number]> = [
  ["listing", 6 * 60 * 60 * 1000],
  ["seller", 24 * 60 * 60 * 1000],
  ["keyword", 7 * 24 * 60 * 60 * 1000],
];

export const scanCron = schedules.task({
  id: "scan-cron",
  cron: { pattern: "*/5 * * * *", environments: ["PRODUCTION"] },
  machine: "micro",
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  run: async () => {
    await setMachineMetadata();
    const configs = await loadAllScanConfigs();
    const results: DispatchResult[] = [];
    for (const [entity, cooldownMs] of SWEEPS) {
      metadata.set("status", `sweeping-${entity}`);
      results.push(...(await sweep(entity, cooldownMs, configs)));
    }
    metadata.set(
      "status",
      results.some((r) => r.status === "incomplete")
        ? "incomplete"
        : "completed"
    );
    logger.info("Scan cron tick completed", { results });
    return { results };
  },
});

interface DispatchResult {
  entity: ScanEntity;
  marketplace: string;
  status: "disabled" | "unsupported" | "completed" | "incomplete";
  triggered?: number;
}

async function sweep(
  entity: ScanEntity,
  cooldownMs: number,
  configs: ScanConfig[]
): Promise<DispatchResult[]> {
  const results: DispatchResult[] = [];
  for (const config of configs) {
    const { marketplace, enabled } = config;
    if (!enabled) {
      results.push({ entity, marketplace, status: "disabled", triggered: 0 });
      continue;
    }
    try {
      if (!supportsScanEntity(marketplace, entity)) {
        results.push({
          entity,
          marketplace,
          status: "unsupported",
          triggered: 0,
        });
        continue;
      }
      const triggered = await dispatchStale(entity, config, cooldownMs);
      results.push({ entity, marketplace, status: "completed", triggered });
    } catch (error) {
      // One marketplace outage must not prevent the other sweeps from running.
      logger.error("Scan cron dispatch failed", { entity, marketplace, error });
      results.push({ entity, marketplace, status: "incomplete" });
    }
  }
  return results;
}

async function dispatchStale(
  entity: ScanEntity,
  config: ScanConfig,
  cooldownMs: number
) {
  const { marketplace } = config;
  const pick = {
    listing: pickStaleListings,
    seller: pickStaleSellers,
    keyword: pickStaleKeywords,
  }[entity];
  const references = await pick(
    marketplace,
    cooldownMs,
    config[`${entity}BatchSize`]
  );
  if (references.length === 0) {
    return 0;
  }
  switch (entity) {
    case "listing":
      await scanListingsByIds.trigger(
        { marketplace, listingIds: references, config },
        { priority: 3600 }
      );
      break;
    case "seller":
      await scanListingsBySeller.batchTrigger(
        await Promise.all(
          references.map(async (sellerId) => ({
            payload: { marketplace, sellerId, config },
            options: {
              ...(await scanLaunchOptions("seller", marketplace, sellerId)),
              priority: 1800,
            },
          }))
        )
      );
      break;
    case "keyword":
      await scanListingsByKeywords.trigger(
        { marketplace, keywords: references, config },
        { priority: 0 }
      );
      break;
    default:
      throw new Error(`Unknown scan entity: ${entity}`);
  }
  return references.length;
}

async function pickStaleKeywords(
  marketplace: string,
  cooldownMs: number,
  batchSize: number
): Promise<string[]> {
  const freshUntil = new Date(Date.now() - cooldownMs);
  const rows = await db
    .select({ keyword: scanKeyword.keyword })
    .from(scanKeyword)
    .where(
      and(
        eq(scanKeyword.marketplace, marketplace),
        isNull(scanKeyword.deadAt),
        or(
          isNull(scanKeyword.lastScannedAt),
          lte(scanKeyword.lastScannedAt, freshUntil)
        )
      )
    )
    .orderBy(sql`${scanKeyword.lastScannedAt} ASC NULLS FIRST`)
    .limit(batchSize);
  return rows.map((r) => r.keyword);
}

async function pickStaleSellers(
  marketplace: string,
  cooldownMs: number,
  batchSize: number
): Promise<string[]> {
  const freshUntil = new Date(Date.now() - cooldownMs);
  const rows = await db
    .select({ reference: scanSeller.reference })
    .from(scanSeller)
    .where(
      and(
        eq(scanSeller.marketplace, marketplace),
        or(
          isNull(scanSeller.lastScannedAt),
          lte(scanSeller.lastScannedAt, freshUntil)
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
  cooldownMs: number,
  batchSize: number
): Promise<string[]> {
  const freshUntil = new Date(Date.now() - cooldownMs);
  const rows = await db
    .select({ reference: scanListing.reference })
    .from(scanListing)
    .where(
      and(
        eq(scanListing.marketplace, marketplace),
        or(
          isNull(scanListing.lastScannedAt),
          lte(scanListing.lastScannedAt, freshUntil)
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
