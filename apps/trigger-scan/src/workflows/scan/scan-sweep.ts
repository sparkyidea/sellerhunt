/**
 * Shared sweep body for the three entity crons (`scan-keyword-cron`,
 * `scan-seller-cron`, `scan-listing-cron`). Each cron owns one entity and
 * sweeps every configured marketplace for it; this module holds the
 * per-marketplace guard chain and the per-entity dispatch so the three task
 * files stay declarations only.
 *
 * No waits or timestamps here — schedules are managed in the dashboard.
 */
import { logger, metadata } from "@trigger.dev/sdk";
import { pickStale } from "../../nodes/scan/scan-dispatch";
import { chunk } from "../../utils/chunk";
import { setMachineMetadata } from "../../utils/machine-metadata";
import { batchWaves } from "../../utils/scan-batch";
import {
  type ScanEntity,
  supportsScanEntity,
} from "../../utils/scan-capabilities";
import { loadAllScanConfigs, type ScanConfig } from "../../utils/scan-config";
import { inFlight, listingSweepInFlight } from "../../utils/scan-in-flight";
import {
  launchTags,
  marketplaceTag,
  SOURCE_CRON_TAG,
} from "../../utils/scan-tags";
import { scanListingsByIds } from "./scan-listings-by-ids";
import { scanListingsByKeywords } from "./scan-listings-by-keywords";
import { scanListingsBySeller } from "./scan-listings-by-seller";

export interface DispatchResult {
  entity: ScanEntity;
  marketplace: string;
  reason?: "in-flight" | "in-flight-unknown";
  status: "disabled" | "unsupported" | "completed" | "incomplete" | "skipped";
  triggered?: number;
}

/** One cron tick: sweep `entity` across every configured marketplace. */
export async function runEntityCron(
  entity: ScanEntity
): Promise<{ results: DispatchResult[] }> {
  await setMachineMetadata();
  metadata.set("status", `sweeping-${entity}`);
  const configs = await loadAllScanConfigs();
  const results: DispatchResult[] = [];
  for (const config of configs) {
    results.push(await sweep(entity, config));
  }
  metadata.set(
    "status",
    results.some((r) => r.status === "incomplete") ? "incomplete" : "completed"
  );
  logger.info("Scan cron completed", { entity, results });
  return { results };
}

async function sweep(
  entity: ScanEntity,
  config: ScanConfig
): Promise<DispatchResult> {
  const { marketplace } = config;
  const base = { entity, marketplace };
  if (!config.enabled) {
    return { ...base, status: "disabled", triggered: 0 };
  }
  try {
    if (!supportsScanEntity(marketplace, entity)) {
      return { ...base, status: "unsupported", triggered: 0 };
    }
    let exclude: Set<string>;
    try {
      if (entity === "listing") {
        if (await listingSweepInFlight(marketplace)) {
          return { ...base, status: "skipped", reason: "in-flight" };
        }
        exclude = new Set();
      } else {
        exclude = await inFlight(entity, marketplace);
      }
    } catch (error) {
      logger.warn("Scan run lookup unavailable; leaving sweep for next tick", {
        ...base,
        error,
      });
      return { ...base, status: "skipped", reason: "in-flight-unknown" };
    }
    const references = (
      await pickStale(entity, marketplace, config[`${entity}BatchSize`])
    ).filter((reference) => !exclude.has(reference));
    if (references.length === 0) {
      return { ...base, status: "completed", triggered: 0 };
    }
    await dispatch(entity, references, config);
    return { ...base, status: "completed", triggered: references.length };
  } catch (error) {
    logger.error("Scan cron dispatch failed", { ...base, error });
    return { ...base, status: "incomplete" };
  }
}

async function dispatch(
  entity: ScanEntity,
  references: string[],
  config: ScanConfig
): Promise<void> {
  if (entity === "listing") {
    await dispatchListings(references, config);
    return;
  }
  if (entity === "seller") {
    await dispatchSellers(references, config);
    return;
  }
  await dispatchKeywords(references, config);
}

async function dispatchListings(
  listingIdList: string[],
  config: ScanConfig
): Promise<void> {
  const { marketplace } = config;
  for (const wave of batchWaves(
    chunk(listingIdList, Math.max(1, config.listingScanBatchSize))
  )) {
    if (wave.length === 0) {
      continue;
    }
    await scanListingsByIds.batchTrigger(
      wave.map((listingIds) => ({
        payload: { marketplace, listingIds, config },
        options: { tags: [marketplaceTag(marketplace), SOURCE_CRON_TAG] },
      }))
    );
  }
}

async function dispatchSellers(
  sellerIds: string[],
  config: ScanConfig
): Promise<void> {
  const { marketplace } = config;
  for (const wave of batchWaves(sellerIds)) {
    await scanListingsBySeller.batchTrigger(
      wave.map((sellerId) => ({
        payload: { marketplace, sellerId, config },
        options: { tags: launchTags(marketplace, "seller", sellerId) },
      }))
    );
  }
}

async function dispatchKeywords(
  keywords: string[],
  config: ScanConfig
): Promise<void> {
  const { marketplace } = config;
  await scanListingsByKeywords.trigger(
    { marketplace, keywords, config },
    { tags: [marketplaceTag(marketplace)] }
  );
}
