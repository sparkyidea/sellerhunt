import { channelSyncState } from "@dashseller/db/schema";
import { sql } from "drizzle-orm";
import type { SyncContext } from "../context";
import type { SyncDomain } from "../types";

/**
 * Record a domain run outcome on `channel_sync_state`.
 *
 * `syncedAt` (the incremental watermark) advances only on fully-successful
 * runs — a failed run keeps the old watermark so the next run re-reads the
 * missed window. `lastRunAt` always advances; dispatchers use it to spot
 * channels whose schedule stopped firing.
 */
export async function recordDomainRun(
  ctx: SyncContext,
  params: {
    channelId: string;
    /** Conflicts recorded during the run — a clean run clears the error
     * column, but a run that recorded conflicts must not wipe them. */
    conflicts?: number;
    domain: SyncDomain;
    error?: string | null;
    organizationId: string;
    ranAt: Date;
    success: boolean;
    /** Window upper bound captured BEFORE the pull; becomes the watermark. */
    watermark?: Date;
  }
): Promise<void> {
  const syncedAt = params.success ? params.watermark : undefined;
  const clearError = params.success && (params.conflicts ?? 0) === 0;
  await ctx.db
    .insert(channelSyncState)
    .values({
      organizationId: params.organizationId,
      channelId: params.channelId,
      domain: params.domain,
      status: params.success ? "success" : "error",
      error: params.error ?? null,
      syncedAt: syncedAt ?? null,
      lastRunAt: params.ranAt,
    })
    .onConflictDoUpdate({
      target: [channelSyncState.channelId, channelSyncState.domain],
      set: {
        status: params.success ? "success" : "error",
        lastRunAt: params.ranAt,
        ...(params.success ? {} : { error: params.error ?? null }),
        ...(clearError ? { error: null } : {}),
        ...(syncedAt ? { syncedAt } : {}),
        updatedAt: sql`now()`,
      },
    });
}

/** Current per-domain watermark, or null before the first successful run. */
export async function getDomainWatermark(
  ctx: SyncContext,
  channelId: string,
  domain: SyncDomain
): Promise<Date | null> {
  const [row] = await ctx.db
    .select({ syncedAt: channelSyncState.syncedAt })
    .from(channelSyncState)
    .where(
      sql`${channelSyncState.channelId} = ${channelId} AND ${channelSyncState.domain} = ${domain}`
    )
    .limit(1);
  return row?.syncedAt ?? null;
}
