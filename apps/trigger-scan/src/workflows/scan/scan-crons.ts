/** Five-minute heartbeat (schedule managed in the dashboard). No waits or timestamps. */
import { logger, metadata, schedules } from "@trigger.dev/sdk";
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

const SWEEPS: readonly ScanEntity[] = ["listing", "seller", "keyword"];
interface DispatchResult {
  entity: ScanEntity;
  marketplace: string;
  reason?: "in-flight" | "in-flight-unknown";
  status: "disabled" | "unsupported" | "completed" | "incomplete" | "skipped";
  triggered?: number;
}
export const scanCron = schedules.task({
  id: "scan-cron",
  machine: "micro",
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  run: async () => {
    await setMachineMetadata();
    const configs = await loadAllScanConfigs();
    const results: DispatchResult[] = [];
    for (const entity of SWEEPS) {
      metadata.set("status", `sweeping-${entity}`);
      for (const config of configs) {
        results.push(await sweep(entity, config));
      }
    }
    metadata.set(
      "status",
      results.some((r) => r.status === "incomplete")
        ? "incomplete"
        : "completed"
    );
    logger.info("Scan cron completed", { results });
    return { results };
  },
});

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
  const { marketplace } = config;
  if (entity === "listing") {
    for (const wave of batchWaves(
      chunk(references, Math.max(1, config.listingScanBatchSize))
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
  } else if (entity === "seller") {
    for (const wave of batchWaves(references)) {
      await scanListingsBySeller.batchTrigger(
        wave.map((sellerId) => ({
          payload: { marketplace, sellerId, config },
          options: { tags: launchTags(marketplace, "seller", sellerId) },
        }))
      );
    }
  } else {
    await scanListingsByKeywords.trigger(
      { marketplace, keywords: references, config },
      { tags: [marketplaceTag(marketplace)] }
    );
  }
}
