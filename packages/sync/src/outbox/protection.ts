import { syncOutbox } from "@dashseller/db/schema";
import { and, inArray, sql } from "drizzle-orm";
import type { SyncContext } from "../context";

const IN_FLIGHT_STATUSES = [
  "pending",
  "claimed",
  "reconciling",
  "sending",
  "awaiting_confirmation",
  "reconciliation_required",
] as const;

/**
 * Entity ids with at least one in-flight outbox row. The pull side keeps
 * its hands off protected fields on these entities so a marketplace fetch
 * can't stomp a local mutation that is still propagating.
 *
 * Rule: SYN-003. Adding an entity to sync means extending the protected
 * field set too.
 */
export async function getProtectedEntityIds(
  ctx: SyncContext,
  entityType: string,
  entityIds: string[]
): Promise<Set<string>> {
  if (entityIds.length === 0) {
    return new Set();
  }

  const rows = await ctx.db
    .select({ entityId: syncOutbox.entityId })
    .from(syncOutbox)
    .where(
      and(
        sql`${syncOutbox.entityType} = ${entityType}`,
        inArray(syncOutbox.entityId, entityIds),
        inArray(syncOutbox.status, [...IN_FLIGHT_STATUSES])
      )
    );

  return new Set(rows.map((r) => r.entityId));
}

export interface InFlightOutboxRow {
  claimGeneration: number;
  entityId: string;
  externalRef: string | null;
  id: string;
  sourceId: string | null;
  status: string;
  /** Last transition time — for `awaiting_confirmation` rows this is when
   * the push completed, i.e. the row's age for retry-window decisions. */
  updatedAt: Date;
}

/**
 * Outbox rows for in-flight entities, used for remote evidence capture.
 * Carries `claimGeneration` so confirmations fence against a concurrent
 * sweep/re-dispatch, and `externalRef` so a push-returned fulfillment id
 * can be matched directly.
 */
export async function getInFlightOutboxRows(
  ctx: SyncContext,
  entityType: string,
  entityIds: string[]
): Promise<InFlightOutboxRow[]> {
  if (entityIds.length === 0) {
    return [];
  }

  return await ctx.db
    .select({
      id: syncOutbox.id,
      claimGeneration: syncOutbox.claimGeneration,
      entityId: syncOutbox.entityId,
      externalRef: syncOutbox.externalRef,
      sourceId: syncOutbox.sourceId,
      status: syncOutbox.status,
      updatedAt: syncOutbox.updatedAt,
    })
    .from(syncOutbox)
    .where(
      and(
        sql`${syncOutbox.entityType} = ${entityType}`,
        inArray(syncOutbox.entityId, entityIds),
        inArray(syncOutbox.status, [...IN_FLIGHT_STATUSES])
      )
    );
}
