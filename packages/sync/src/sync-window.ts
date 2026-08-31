import type { SyncClock } from "./context";

const BACKFILL_WINDOW_MS = 5 * 60 * 1000;

/**
 * Bounds of one incremental pull. `until` is captured BEFORE the pull
 * starts: the watermark advances to `until` on success — never to a
 * post-pull "now" — so records arriving while the pull runs fall inside
 * the next window instead of a gap.
 */
export interface SyncWindow {
  /** Undefined = full pull (force refresh or first-ever sync). */
  since: Date | undefined;
  until: Date;
}

/**
 * Compute the high-watermark `since` for an incremental pull.
 *
 * Subtracts a small backfill window from the channel's last `syncedAt` to
 * absorb clock skew and late-arriving marketplace data. Returns `undefined`
 * when a full pull is required (force refresh, or first-ever sync).
 */
export function computeIncrementalSince(
  syncedAt: Date | null | undefined,
  forceRefresh: boolean
): Date | undefined {
  if (forceRefresh || !syncedAt) {
    return;
  }
  return new Date(syncedAt.getTime() - BACKFILL_WINDOW_MS);
}

export function openSyncWindow(options: {
  clock: SyncClock;
  forceRefresh: boolean;
  syncedAt: Date | null | undefined;
}): SyncWindow {
  return {
    since: computeIncrementalSince(options.syncedAt, options.forceRefresh),
    until: options.clock.now(),
  };
}
