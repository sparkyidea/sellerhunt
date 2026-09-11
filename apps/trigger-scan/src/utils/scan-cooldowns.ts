/**
 * The one home for scan cooldowns. Every freshness decision in the pipeline
 * derives its cutoff from here: the cron sweep (`scan-crons.ts`, stale when
 * `last_scanned_at <= cutoff` or null), the parent-side prefilters and the
 * child self-gates (`scan-freshness.ts`, fresh when `last_scanned_at > cutoff`).
 * At the exact cutoff an entity is eligible for a rescan.
 *
 * These are code constants, not `scan_config` rows: an inline `config` cannot
 * override them, and a change here takes effect on worker deploy.
 */
import type { ScanEntity } from "./scan-capabilities";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const SCAN_COOLDOWN_MS: Record<ScanEntity, number> = {
  listing: 6 * HOUR_MS,
  seller: DAY_MS,
  keyword: 7 * DAY_MS,
};

/** `now - cooldown` for the entity; compare `last_scanned_at` against it. */
export function freshnessCutoff(
  entity: ScanEntity,
  now: number = Date.now()
): Date {
  return new Date(now - SCAN_COOLDOWN_MS[entity]);
}
