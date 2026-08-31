import { syncOutbox } from "@dashseller/db/schema";
import type { JobClient, QueueName } from "@dashseller/job-client";
import { QUEUES } from "@dashseller/job-client";
import type { SyncContext } from "@dashseller/sync";
import { inArray, sql } from "drizzle-orm";

/** In-memory per-process counters, exposed on /stats and reset on restart. */
export class WorkerCounters {
  completed = 0;
  failed = 0;
  rateLimited = 0;
  stalled = 0;
}

export interface WorkerStats {
  counters: WorkerCounters;
  outbox: {
    oldestPendingAgeSeconds: number | null;
    pending: number;
    reconciliationRequired: number;
  };
  queues: Record<
    string,
    { active: number; delayed: number; failed: number; waiting: number }
  >;
}

/**
 * Live operational snapshot: queue depths from Redis, outbox backlog from
 * Postgres, and this process's counters. The alert thresholds in
 * apps/worker/OPERATIONS.md are defined over exactly these numbers.
 */
export async function collectStats(params: {
  counters: WorkerCounters;
  ctx: SyncContext;
  jobs: JobClient;
}): Promise<WorkerStats> {
  const queues: WorkerStats["queues"] = {};
  await Promise.all(
    (Object.values(QUEUES) as QueueName[]).map(async (name) => {
      const counts = await params.jobs
        .queue(name)
        .getJobCounts("waiting", "active", "delayed", "failed");
      queues[name] = {
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        delayed: counts.delayed ?? 0,
        failed: counts.failed ?? 0,
      };
    })
  );

  // Age is computed inside Postgres — one clock, no JS Date round-trip.
  const [outbox] = await params.ctx.db
    .select({
      pending: sql<number>`count(*) filter (where ${syncOutbox.status} = 'pending')::int`,
      reconciliationRequired: sql<number>`count(*) filter (where ${syncOutbox.status} = 'reconciliation_required')::int`,
      oldestPendingAgeSeconds: sql<
        number | null
      >`extract(epoch from (now() - min(${syncOutbox.createdAt}) filter (where ${syncOutbox.status} = 'pending')))::int`,
    })
    .from(syncOutbox)
    .where(inArray(syncOutbox.status, ["pending", "reconciliation_required"]));

  return {
    queues,
    outbox: {
      pending: outbox?.pending ?? 0,
      reconciliationRequired: outbox?.reconciliationRequired ?? 0,
      oldestPendingAgeSeconds: outbox?.oldestPendingAgeSeconds ?? null,
    },
    counters: params.counters,
  };
}
