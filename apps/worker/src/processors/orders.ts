import {
  JOBS,
  type JobClient,
  QUEUES,
  syncChannelOrdersPayloadSchema,
  syncOrderPayloadSchema,
} from "@dashseller/job-client";
import type { SyncContext } from "@dashseller/sync";
import {
  createOrdersUpsertPorts,
  syncChannelOrders,
  syncOneOrder,
} from "@dashseller/sync";
import type { Registry } from "../registry";
import {
  type ChannelApiClientFactory,
  defaultApiClientFactory,
  throwIfRateLimited,
} from "./shared";

/**
 * Orders domain processors.
 *
 * `sync-order` is the webhook fast path: fetch exactly the order named by
 * the delivery. Adapters without a single-order endpoint fall back to a
 * windowed `sync-channel-orders` run. Any errors from the core throw, so
 * the queue's retry policy re-runs the job — the core is idempotent under
 * re-processing by construction (counters, stale guards, keyed upserts).
 */
export function registerOrderProcessors(params: {
  apiClientFactory?: ChannelApiClientFactory;
  ctx: SyncContext;
  jobs: JobClient;
  registry: Registry;
}): void {
  const {
    ctx,
    jobs,
    registry,
    apiClientFactory = defaultApiClientFactory,
  } = params;

  registry.register(QUEUES.syncOrders, JOBS.syncOrder, async (job) => {
    const payload = syncOrderPayloadSchema.parse(job.data);
    const apiClient = await apiClientFactory(ctx, payload.channelId);

    let outcome: Awaited<ReturnType<typeof syncOneOrder>>;
    try {
      outcome = await syncOneOrder(ctx, {
        apiClient,
        channelId: payload.channelId,
        orderReference: payload.orderReference,
        ports: createOrdersUpsertPorts(ctx, apiClient),
      });
    } catch (error) {
      throwIfRateLimited(error);
    }

    if (outcome.kind === "awaiting-listings") {
      // Terminal, not a retry: the listings processor chains the first
      // orders pull, which covers this order.
      return { outcome: "awaiting-listings" };
    }
    if (outcome.kind === "fallback-required") {
      await jobs.enqueueSyncChannelOrders({
        channelId: payload.channelId,
        forceRefresh: false,
      });
      return { outcome: "fallback-enqueued" };
    }
    if (outcome.kind === "not-found") {
      return { outcome: "not-found" };
    }
    if (outcome.result.errors.length > 0) {
      throw new Error(
        `sync-order completed with errors: ${outcome.result.errors
          .map((e) => `${e.reference}: ${e.error}`)
          .slice(0, 3)
          .join("; ")}`
      );
    }
    return { outcome: "synced", conflicts: outcome.result.conflicts };
  });

  registry.register(QUEUES.syncOrders, JOBS.syncChannelOrders, async (job) => {
    const payload = syncChannelOrdersPayloadSchema.parse(job.data);
    const apiClient = await apiClientFactory(ctx, payload.channelId);

    let result: Awaited<ReturnType<typeof syncChannelOrders>>;
    try {
      result = await syncChannelOrders(ctx, {
        apiClient,
        channelId: payload.channelId,
        forceRefresh: payload.forceRefresh,
        ports: createOrdersUpsertPorts(ctx, apiClient),
      });
    } catch (error) {
      throwIfRateLimited(error);
    }

    if (!result.success) {
      throw new Error(
        `sync-channel-orders failed: ${result.errors.slice(0, 3).join("; ")}`
      );
    }
    if (result.gated) {
      // Terminal, not a retry: no sync-state row was written, and the
      // listings processor chains the real first pull on success.
      return { outcome: "awaiting-listings" };
    }
    return {
      totalPulled: result.totalPulled,
      ordersUpserted: result.ordersUpserted,
      staleRejected: result.staleRejected,
    };
  });
}
