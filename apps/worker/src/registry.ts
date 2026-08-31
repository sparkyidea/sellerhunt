import type { QueueName } from "@dashseller/job-client";
import type { SyncLogger } from "@dashseller/sync";
import { DelayedError, type Job, UnrecoverableError } from "bullmq";

export type JobHandler = (job: Job, token?: string) => Promise<unknown>;

/**
 * Thrown by processors when the marketplace answered 429. The base
 * processor turns it into `job.moveToDelayed(now + retryAfter + jitter)`
 * + DelayedError, so the job re-runs after the window WITHOUT burning a
 * retry attempt — per-job backpressure, not queue-wide.
 */
export class RateLimitedError extends Error {
  readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super(`Rate limited — retry after ${retryAfterMs}ms`);
    this.name = "RateLimitedError";
    this.retryAfterMs = retryAfterMs;
  }
}

const RATE_LIMIT_JITTER_MS = 5000;

/**
 * Job-name router for one queue. Every queue gets exactly one BullMQ
 * Worker whose processor looks the handler up here; an unregistered job
 * name is an UnrecoverableError — a deploy-ordering bug, not a retryable
 * condition.
 */
export class Registry {
  private readonly handlers = new Map<QueueName, Map<string, JobHandler>>();
  private readonly logger: SyncLogger;
  private readonly onRateLimited: (() => void) | undefined;

  constructor(logger: SyncLogger, options?: { onRateLimited?: () => void }) {
    this.logger = logger;
    this.onRateLimited = options?.onRateLimited;
  }

  register(queue: QueueName, jobName: string, handler: JobHandler): void {
    let queueHandlers = this.handlers.get(queue);
    if (!queueHandlers) {
      queueHandlers = new Map();
      this.handlers.set(queue, queueHandlers);
    }
    if (queueHandlers.has(jobName)) {
      throw new Error(`Handler already registered: ${queue}/${jobName}`);
    }
    queueHandlers.set(jobName, handler);
  }

  processor(queue: QueueName): (job: Job, token?: string) => Promise<unknown> {
    return async (job, token) => {
      const handler = this.handlers.get(queue)?.get(job.name);
      if (!handler) {
        throw new UnrecoverableError(
          `No processor registered for ${queue}/${job.name}`
        );
      }
      try {
        return await handler(job, token);
      } catch (error) {
        if (error instanceof RateLimitedError && token) {
          this.onRateLimited?.();
          const delayUntil =
            Date.now() +
            error.retryAfterMs +
            Math.floor(Math.random() * RATE_LIMIT_JITTER_MS);
          this.logger.warn("Rate limited — delaying job", {
            queue,
            jobName: job.name,
            jobId: job.id,
            delayUntil,
          });
          await job.moveToDelayed(delayUntil, token);
          throw new DelayedError();
        }
        throw error;
      }
    };
  }
}
