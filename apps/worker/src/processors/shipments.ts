import { syncOutbox } from "@dashseller/db/schema";
import { JOBS, outboxJobPayloadSchema, QUEUES } from "@dashseller/job-client";
import type { SyncContext } from "@dashseller/sync";
import {
  OutboxTransitionError,
  pushShipment,
  recoverShipmentPush,
  TokenManager,
} from "@dashseller/sync";
import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import type { Registry } from "../registry";
import { throwIfRateLimited } from "./shared";

async function buildShipmentPorts(ctx: SyncContext, outboxId: string) {
  const [row] = await ctx.db
    .select({ channelId: syncOutbox.channelId })
    .from(syncOutbox)
    .where(eq(syncOutbox.id, outboxId))
    .limit(1);
  if (!row) {
    return null;
  }
  const { channelDetails, tokenData } = await TokenManager.loadForChannel(
    ctx,
    row.channelId
  );
  const tokenManager = new TokenManager(ctx, channelDetails, tokenData);
  const apiClient = await tokenManager.createApiClient();
  return {
    apiClient,
    refreshApiClient: () => tokenManager.forceRefreshAndCreateApiClient(),
  };
}

function requireJobId(job: Job): string {
  if (!job.id) {
    throw new Error("outbox jobs must carry a stable job id");
  }
  return job.id;
}

/**
 * Shipments domain processors — the fenced outbox push and its recovery.
 * The claim's generation comes from the payload and the STABLE job id from
 * the enqueue-time jobId (`outbox-{rowId}-{gen}`), so retries of the same
 * job resume their own claim while stale retained jobs are fenced out.
 */
export function registerShipmentProcessors(params: {
  ctx: SyncContext;
  registry: Registry;
}): void {
  const { ctx, registry } = params;

  registry.register(QUEUES.syncShipments, JOBS.syncShipment, async (job) => {
    const payload = outboxJobPayloadSchema.parse(job.data);
    const claim = {
      rowId: payload.outboxId,
      generation: payload.generation,
      jobId: requireJobId(job),
    };
    const ports = await buildShipmentPorts(ctx, payload.outboxId);
    if (!ports) {
      return { outcome: "missing-row" };
    }
    try {
      return await pushShipment(ctx, { claim, ports });
    } catch (error) {
      if (error instanceof OutboxTransitionError) {
        // Stale generation or concurrent claim — the row moved on without
        // us. Terminal by design, never a retry.
        ctx.logger.info("Outbox claim stale — job is a no-op", {
          outboxId: payload.outboxId,
          generation: payload.generation,
        });
        return { outcome: "stale-claim" };
      }
      throwIfRateLimited(error);
    }
  });

  registry.register(QUEUES.syncShipments, JOBS.recoverOutbox, async (job) => {
    const payload = outboxJobPayloadSchema.parse(job.data);
    const claim = {
      rowId: payload.outboxId,
      generation: payload.generation,
      jobId: requireJobId(job),
    };
    const ports = await buildShipmentPorts(ctx, payload.outboxId);
    if (!ports) {
      return { outcome: "missing-row" };
    }
    try {
      const outcome = await recoverShipmentPush(ctx, { claim, ports });
      return { outcome };
    } catch (error) {
      if (error instanceof OutboxTransitionError) {
        ctx.logger.info("Recovery claim stale — job is a no-op", {
          outboxId: payload.outboxId,
          generation: payload.generation,
        });
        return { outcome: "stale-claim" };
      }
      throwIfRateLimited(error);
    }
  });
}
