import { channelSyncState } from "@dashseller/db/schema";
import { sql } from "drizzle-orm";
import type { SyncContext } from "./context";
import type { SyncDomain } from "./types";

export interface SyncConflict {
  channelId: string;
  domain: SyncDomain;
  /** e.g. "orderLine", "stock", "listing" */
  entity: string;
  entityId: string;
  organizationId: string;
  reason: string;
}

/**
 * Durable per-domain conflict marker plus a structured log line. Conflicts
 * never block the rest of a run — the affected entity keeps its current
 * state (no effects applied, or clamped effects), the domain's sync-state
 * row carries the latest conflict for the UI, and the log carries the
 * entity-level detail for the operator.
 */
export async function recordSyncConflict(
  ctx: SyncContext,
  conflict: SyncConflict
): Promise<void> {
  ctx.logger.error("sync conflict", { ...conflict });
  const message = `${conflict.entity} ${conflict.entityId}: ${conflict.reason}`;
  await ctx.db
    .insert(channelSyncState)
    .values({
      organizationId: conflict.organizationId,
      channelId: conflict.channelId,
      domain: conflict.domain,
      error: message,
    })
    .onConflictDoUpdate({
      target: [channelSyncState.channelId, channelSyncState.domain],
      set: {
        error: message,
        updatedAt: sql`now()`,
      },
    });
}
