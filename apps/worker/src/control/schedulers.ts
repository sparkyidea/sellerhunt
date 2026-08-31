import type { JobClient } from "@dashseller/job-client";
import { JOBS, QUEUES } from "@dashseller/job-client";
import type { SyncLogger } from "@dashseller/sync";

const MINUTE_MS = 60_000;

/**
 * Repeatable schedules on the control queue, keyed by STABLE scheduler ids
 * — `upsertJobScheduler` makes registration idempotent, so every worker
 * replica upserts the same set at boot and nothing doubles.
 *
 * Wide-tick philosophy: dispatchers run frequently and re-derive the work
 * list from the database each time. The eligibility query is the schedule
 * repair; per-channel spread comes from delayed jobs, not from per-channel
 * schedules that could drift or leak.
 */
const SCHEDULES: Array<{ everyMs: number; id: string; jobName: string }> = [
  {
    id: "dispatch-channel-syncs",
    jobName: JOBS.dispatchChannelSyncs,
    everyMs: 15 * MINUTE_MS,
  },
  {
    id: "dispatch-subscription-repairs",
    jobName: JOBS.dispatchSubscriptionRepairs,
    everyMs: 6 * 60 * MINUTE_MS,
  },
  {
    id: "dispatch-outbox-recovery",
    jobName: JOBS.dispatchOutboxRecovery,
    everyMs: MINUTE_MS,
  },
  {
    id: "drain-sync-outbox",
    jobName: JOBS.drainSyncOutbox,
    everyMs: MINUTE_MS,
  },
  {
    id: "outbox-stale-reset",
    jobName: JOBS.outboxStaleReset,
    everyMs: 5 * MINUTE_MS,
  },
  {
    id: "outbox-sending-sweep",
    jobName: JOBS.outboxSendingSweep,
    everyMs: 5 * MINUTE_MS,
  },
  {
    id: "outbox-conflict-escalation",
    jobName: JOBS.outboxConflictEscalation,
    everyMs: 15 * MINUTE_MS,
  },
  {
    id: "outbox-cleanup",
    jobName: JOBS.outboxCleanup,
    everyMs: 60 * MINUTE_MS,
  },
];

/**
 * Gated behind SYNC_SCHEDULERS_ENABLED: until cutover (P16) the worker
 * only processes explicitly-enqueued jobs and registers NOTHING here —
 * the legacy Trigger schedules stay the only periodic driver.
 *
 * The disabled branch actively REMOVES the scheduler records: BullMQ
 * persists them in Redis, so a boot that merely skipped the upserts would
 * leave a previously-enabled deployment's schedules firing forever — the
 * rollback path in CUTOVER.md depends on the flag flip actually stopping
 * them.
 */
export async function registerSchedulers(params: {
  enabled: boolean;
  jobs: JobClient;
  logger: SyncLogger;
}): Promise<void> {
  const queue = params.jobs.queue(QUEUES.syncControl);
  if (!params.enabled) {
    let removed = 0;
    for (const schedule of SCHEDULES) {
      if (await queue.removeJobScheduler(schedule.id)) {
        removed += 1;
      }
    }
    params.logger.info("Schedulers disabled — none registered", { removed });
    return;
  }
  for (const schedule of SCHEDULES) {
    await queue.upsertJobScheduler(
      schedule.id,
      { every: schedule.everyMs },
      { name: schedule.jobName, data: {} }
    );
  }
  params.logger.info("Schedulers registered", {
    count: SCHEDULES.length,
  });
}
