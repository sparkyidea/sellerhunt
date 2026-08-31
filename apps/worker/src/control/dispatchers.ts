import { createHash } from "node:crypto";
import { channel, syncOutbox, webhookDelivery } from "@dashseller/db/schema";
import type { JobClient } from "@dashseller/job-client";
import { JOBS, QUEUES } from "@dashseller/job-client";
import type { SyncContext } from "@dashseller/sync";
import {
  listPendingRows,
  listRecoverableRows,
  resetStaleClaims,
  sweepSendingTimeouts,
} from "@dashseller/sync";
import { and, eq, inArray, lt } from "drizzle-orm";
import type { Registry } from "../registry";

/** Dispatch spread window — matches the 15-minute dispatcher cadence. */
const SPREAD_WINDOW_S = 900;
const OUTBOX_BATCH = 100;
const STALE_CLAIM_MINUTES = 15;
const SENDING_TIMEOUT_MINUTES = 10;
const CONFLICT_ESCALATION_MINUTES = 60;
const CLEANUP_AFTER_DAYS = 7;
const DELIVERY_LOG_RETENTION_DAYS = 30;

/**
 * Deterministic per-channel delay inside the dispatch window, so a fleet
 * of channels spreads instead of stampeding at each tick.
 */
export function channelSpreadDelayMs(channelId: string): number {
  const digest = createHash("sha256").update(channelId, "utf8").digest();
  const value = digest.readUInt32BE(0);
  return (value % SPREAD_WINDOW_S) * 1000;
}

async function eligibleChannels(ctx: SyncContext): Promise<string[]> {
  const rows = await ctx.db
    .select({ id: channel.id })
    .from(channel)
    .where(
      and(
        eq(channel.connected, true),
        eq(channel.enabled, true),
        eq(channel.archived, false)
      )
    );
  return rows.map((row) => row.id);
}

/**
 * The eligibility query IS the schedule repair: a channel that somehow
 * missed earlier ticks (new connect, crashed enqueue, dropped job) is
 * simply picked up on the next one. Per-channel dedup keeps a still-queued
 * job from doubling.
 */
export async function runDispatchChannelSyncs(
  ctx: SyncContext,
  jobs: JobClient
): Promise<{ channels: number }> {
  const channels = await eligibleChannels(ctx);
  for (const channelId of channels) {
    const delayMs = channelSpreadDelayMs(channelId);
    await jobs.enqueueSyncChannelOrders(
      { channelId, forceRefresh: false },
      { delayMs }
    );
    await jobs.enqueueSyncChannelListings(
      { channelId, forceRefresh: false },
      undefined,
      { delayMs }
    );
  }
  ctx.logger.info("Dispatched channel syncs", { channels: channels.length });
  return { channels: channels.length };
}

export async function runDispatchSubscriptionRepairs(
  ctx: SyncContext,
  jobs: JobClient
): Promise<{ channels: number }> {
  const channels = await eligibleChannels(ctx);
  for (const channelId of channels) {
    await jobs.enqueueRepairChannelSubscriptions({ channelId });
  }
  ctx.logger.info("Dispatched subscription repairs", {
    channels: channels.length,
  });
  return { channels: channels.length };
}

/**
 * Enqueue recovery jobs for unowned `reconciliation_required` rows. Scan
 * only — a failed enqueue leaves the row unowned and the next tick
 * re-scans it (the self-healing half of the two-step recovery).
 */
export async function runDispatchOutboxRecovery(
  ctx: SyncContext,
  jobs: JobClient
): Promise<{ dispatched: number }> {
  const rows = await listRecoverableRows(ctx, OUTBOX_BATCH);
  for (const row of rows) {
    await jobs.enqueueRecoverOutbox({
      outboxId: row.id,
      generation: row.claimGeneration,
    });
  }
  if (rows.length > 0) {
    ctx.logger.info("Dispatched outbox recoveries", {
      dispatched: rows.length,
    });
  }
  return { dispatched: rows.length };
}

/**
 * Drain `pending` outbox rows into push jobs. The post-commit dispatch in
 * the API does the same enqueue eagerly; the fenced jobId
 * (`outbox-{rowId}-{generation}`) makes duplicate ticks idempotent, and a
 * post-commit enqueue failure is recovered here — Postgres is the durable
 * boundary.
 */
export async function runDrainSyncOutbox(
  ctx: SyncContext,
  jobs: JobClient
): Promise<{ drained: number }> {
  const rows = await listPendingRows(ctx, OUTBOX_BATCH);
  for (const row of rows) {
    await jobs.enqueueSyncShipment({
      outboxId: row.id,
      generation: row.claimGeneration,
    });
  }
  if (rows.length > 0) {
    ctx.logger.info("Drained pending outbox rows", { drained: rows.length });
  }
  return { drained: rows.length };
}

export async function runOutboxStaleReset(
  ctx: SyncContext
): Promise<{ claims: number; recoveries: number }> {
  const { claims, recoveries } = await resetStaleClaims(ctx, {
    olderThan: new Date(Date.now() - STALE_CLAIM_MINUTES * 60 * 1000),
  });
  if (claims.length > 0 || recoveries.length > 0) {
    ctx.logger.warn("Reset stale outbox claims", {
      claims: claims.length,
      recoveries: recoveries.length,
    });
  }
  return { claims: claims.length, recoveries: recoveries.length };
}

export async function runOutboxSendingSweep(
  ctx: SyncContext
): Promise<{ swept: number }> {
  const swept = await sweepSendingTimeouts(ctx, {
    olderThan: new Date(Date.now() - SENDING_TIMEOUT_MINUTES * 60 * 1000),
  });
  if (swept.length > 0) {
    ctx.logger.warn("Swept timed-out sending rows to recovery", {
      swept: swept.length,
    });
  }
  return { swept: swept.length };
}

export async function runOutboxConflictEscalation(
  ctx: SyncContext
): Promise<{ escalated: number }> {
  const cutoff = new Date(Date.now() - CONFLICT_ESCALATION_MINUTES * 60 * 1000);
  const escalated = await ctx.db
    .update(syncOutbox)
    .set({
      status: "conflict",
      error:
        "Awaiting confirmation for over 1 hour without convergence — escalated to conflict",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(syncOutbox.status, "awaiting_confirmation"),
        lt(syncOutbox.updatedAt, cutoff)
      )
    )
    .returning({ id: syncOutbox.id });
  if (escalated.length > 0) {
    ctx.logger.warn("Escalated outbox rows to conflict", {
      escalated: escalated.length,
    });
  }
  return { escalated: escalated.length };
}

export async function runOutboxCleanup(
  ctx: SyncContext
): Promise<{ deleted: number; prunedDeliveries: number }> {
  const cutoff = new Date(
    Date.now() - CLEANUP_AFTER_DAYS * 24 * 60 * 60 * 1000
  );
  const deleted = await ctx.db
    .delete(syncOutbox)
    .where(
      and(
        inArray(syncOutbox.status, ["confirmed", "canceled"]),
        lt(syncOutbox.updatedAt, cutoff)
      )
    )
    .returning({ id: syncOutbox.id });
  const deliveryCutoff = new Date(
    Date.now() - DELIVERY_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );
  const prunedDeliveries = await ctx.db
    .delete(webhookDelivery)
    .where(lt(webhookDelivery.lastSeenAt, deliveryCutoff))
    .returning({ id: webhookDelivery.id });
  if (deleted.length > 0 || prunedDeliveries.length > 0) {
    ctx.logger.info("Cleaned resolved outbox rows", {
      deleted: deleted.length,
      prunedDeliveries: prunedDeliveries.length,
    });
  }
  return { deleted: deleted.length, prunedDeliveries: prunedDeliveries.length };
}

/** Register every control-plane job on the sync-control queue. */
export function registerControlProcessors(params: {
  ctx: SyncContext;
  jobs: JobClient;
  registry: Registry;
}): void {
  const { ctx, jobs, registry } = params;
  registry.register(QUEUES.syncControl, JOBS.dispatchChannelSyncs, () =>
    runDispatchChannelSyncs(ctx, jobs)
  );
  registry.register(QUEUES.syncControl, JOBS.dispatchSubscriptionRepairs, () =>
    runDispatchSubscriptionRepairs(ctx, jobs)
  );
  registry.register(QUEUES.syncControl, JOBS.dispatchOutboxRecovery, () =>
    runDispatchOutboxRecovery(ctx, jobs)
  );
  registry.register(QUEUES.syncControl, JOBS.drainSyncOutbox, () =>
    runDrainSyncOutbox(ctx, jobs)
  );
  registry.register(QUEUES.syncControl, JOBS.outboxStaleReset, () =>
    runOutboxStaleReset(ctx)
  );
  registry.register(QUEUES.syncControl, JOBS.outboxSendingSweep, () =>
    runOutboxSendingSweep(ctx)
  );
  registry.register(QUEUES.syncControl, JOBS.outboxConflictEscalation, () =>
    runOutboxConflictEscalation(ctx)
  );
  registry.register(QUEUES.syncControl, JOBS.outboxCleanup, () =>
    runOutboxCleanup(ctx)
  );
}
