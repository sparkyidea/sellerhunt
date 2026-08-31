import { env } from "@dashseller/env/worker";
import {
  createJobClient,
  QUEUE_TOPOLOGY,
  QUEUES,
  type QueueName,
} from "@dashseller/job-client";
import { Worker } from "bullmq";
import { createWorkerContext } from "./context";
import { registerSchedulers } from "./control/schedulers";
import { registerProcessors } from "./processors";
import { Registry } from "./registry";
import { startHttpServer } from "./server";
import { WorkerCounters } from "./stats";

const SHUTDOWN_DEADLINE_MS = 30_000;
const DEFAULT_PORT = 8788;

const { ctx, close: closeDb } = createWorkerContext();
const jobs = createJobClient(env.REDIS_QUEUE_URL);
const counters = new WorkerCounters();
const registry = new Registry(ctx.logger, {
  onRateLimited: () => {
    counters.rateLimited += 1;
  },
});

registerProcessors({
  ctx,
  jobs,
  registry,
  config: {
    webhookBaseUrl: env.WEBHOOK_BASE_URL,
    ebayVerificationToken: env.EBAY_WEBHOOK_VERIFICATION_TOKEN,
  },
});

const queueNames = Object.values(QUEUES) as QueueName[];
const workers = queueNames.map((name) => {
  const topology = QUEUE_TOPOLOGY[name];
  return new Worker(name, registry.processor(name), {
    connection: {
      url: env.REDIS_QUEUE_URL,
      // Workers own long-lived blocking connections; retries must never
      // give up on a command or the worker silently stops consuming.
      maxRetriesPerRequest: null,
    },
    concurrency: topology.localConcurrency,
    lockDuration: topology.lockDurationMs,
    // One stall = one redelivery; a job that stalls twice goes to failed
    // instead of looping forever.
    maxStalledCount: 1,
  });
});

for (const worker of workers) {
  worker.on("completed", (job) => {
    counters.completed += 1;
    ctx.logger.info("Job completed", {
      queue: worker.name,
      jobName: job.name,
      jobId: job.id,
      attemptsMade: job.attemptsMade,
      durationMs:
        job.finishedOn && job.processedOn
          ? job.finishedOn - job.processedOn
          : undefined,
      waitedMs: job.processedOn ? job.processedOn - job.timestamp : undefined,
      result: job.returnvalue,
    });
  });
  worker.on("failed", (job, error) => {
    counters.failed += 1;
    ctx.logger.error("Job failed", {
      queue: worker.name,
      jobName: job?.name,
      jobId: job?.id,
      attemptsMade: job?.attemptsMade,
      willRetry: job ? job.attemptsMade < (job.opts.attempts ?? 1) : false,
      error: error.message,
    });
  });
  worker.on("error", (error) => {
    ctx.logger.error("Worker error", {
      queue: worker.name,
      error: error.message,
    });
  });
  worker.on("stalled", (jobId) => {
    counters.stalled += 1;
    ctx.logger.warn("Job stalled", { queue: worker.name, jobId });
  });
}

// Global concurrency caps apply across every worker replica.
await Promise.all(
  queueNames.map((name) =>
    jobs
      .queue(name)
      .setGlobalConcurrency(QUEUE_TOPOLOGY[name].globalConcurrency)
  )
);

await registerSchedulers({
  enabled: env.SYNC_SCHEDULERS_ENABLED,
  jobs,
  logger: ctx.logger,
});

const health = startHttpServer({
  config: {
    ebayVerificationToken: env.EBAY_WEBHOOK_VERIFICATION_TOKEN,
    webhookBaseUrl: env.WEBHOOK_BASE_URL,
  },
  counters,
  ctx,
  jobs,
  port: env.PORT ?? DEFAULT_PORT,
});

ctx.logger.info("Worker booted", {
  queues: queueNames,
  schedulersEnabled: env.SYNC_SCHEDULERS_ENABLED,
  port: env.PORT ?? DEFAULT_PORT,
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  ctx.logger.info("Shutting down", { signal });

  // 1. Stop HTTP intake so orchestrators drain us out of rotation.
  await health.stop();

  // 2. Close workers under an outer deadline — in-flight jobs get a
  // chance to finish; past the deadline the stalled-job machinery and
  // fenced transitions make abandonment safe.
  const deadline = new Promise<void>((resolve) => {
    setTimeout(resolve, SHUTDOWN_DEADLINE_MS).unref();
  });
  await Promise.race([
    Promise.all(workers.map((worker) => worker.close())),
    deadline,
  ]);

  // 3. Close producer queues, then the DB pool.
  await jobs.close();
  await closeDb();

  ctx.logger.info("Shutdown complete", { signal });
  process.exit(0);
}

process.on("SIGTERM", () => {
  shutdown("SIGTERM").catch(() => process.exit(1));
});
process.on("SIGINT", () => {
  shutdown("SIGINT").catch(() => process.exit(1));
});
