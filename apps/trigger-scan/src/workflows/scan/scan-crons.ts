/**
 * Marketplace-wide heartbeats with inline per-entity cooldowns. Each cron
 * sweeps every enabled `scan_config` row but only launches an entity where the
 * marketplace adapter implements it (`supportsScanEntity`); shop serves listing
 * detail only today, so its keyword and seller sweeps report `unsupported`.
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

const cronOptions = {
  cron: { pattern: "*/5 * * * *", environments: ["PRODUCTION" as const] },
  machine: "micro" as const,
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
};

export const scanListingsCron = schedules.task({
  id: "scan-listings-cron",
  ...cronOptions,
  run: async () => await runCron("listing", 6 * 60 * 60 * 1000),
});

export const scanSellersCron = schedules.task({
  id: "scan-sellers-cron",
  ...cronOptions,
  run: async () => await runCron("seller", 24 * 60 * 60 * 1000),
});

export const scanKeywordsCron = schedules.task({
  id: "scan-keywords-cron",
  ...cronOptions,
  run: async () => await runCron("keyword", 7 * 24 * 60 * 60 * 1000),
});

interface DispatchResult {
  marketplace: string;
  status: "disabled" | "unsupported" | "completed" | "incomplete";
  triggered?: number;
}

async function runCron(entity: ScanEntity, cooldownMs: number) {
  await setMachineMetadata();
  metadata.set("entity", entity).set("status", "picking-stale");
  const results: DispatchResult[] = [];
  for (const config of await loadAllScanConfigs()) {
    const { marketplace, enabled } = config;
    if (!enabled) {
      results.push({ marketplace, status: "disabled", triggered: 0 });
      continue;
    }
    try {
      if (!supportsScanEntity(marketplace, entity)) {
        results.push({ marketplace, status: "unsupported", triggered: 0 });
        continue;
      }
      const triggered = await dispatchStale(entity, config, cooldownMs);
      results.push({ marketplace, status: "completed", triggered });
    } catch (error) {
      // One marketplace outage must not prevent the others from scanning.
      logger.error("Scan cron dispatch failed", { entity, marketplace, error });
      results.push({ marketplace, status: "incomplete" });
    }
  }
  metadata.set(
    "status",
    results.some((r) => r.status === "incomplete") ? "incomplete" : "completed"
  );
  logger.info("Scan cron tick completed", { entity, results });
  return { entity, results };
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
