import { Queue } from "bullmq";
import {
  dedup,
  deliveryJobId,
  outboxJobId,
  recoverOutboxJobId,
} from "./job-ids";
import type {
  ArchiveListingPayload,
  ChannelJobPayload,
  DisconnectChannelPayload,
  OutboxJobPayload,
  SyncChannelListingsPayload,
  SyncChannelOrdersPayload,
  SyncOrderPayload,
} from "./payloads";
import {
  DEFAULT_RETENTION,
  JOBS,
  QUEUE_TOPOLOGY,
  QUEUES,
  type QueueName,
} from "./queues";

/**
 * Delivery-context for jobs enqueued by the webhook receiver: the job id
 * derives from the marketplace delivery id (redeliveries collapse onto the
 * same job) and the job is removed IMMEDIATELY on failure — a lazily
 * age-removed failed job would keep its id alive and silently swallow the
 * marketplace's redelivery of the same event.
 */
export interface DeliveryContext {
  deliveryId: string;
  marketplace: string;
}

function deliveryOptions(delivery?: DeliveryContext) {
  if (!delivery) {
    return DEFAULT_RETENTION;
  }
  return {
    jobId: deliveryJobId(delivery.marketplace, delivery.deliveryId),
    removeOnComplete: DEFAULT_RETENTION.removeOnComplete,
    removeOnFail: true as const,
  };
}

export interface JobClient {
  close(): Promise<void>;
  enqueueArchiveListing(
    payload: ArchiveListingPayload,
    delivery?: DeliveryContext
  ): Promise<void>;
  enqueueDisconnectChannel(
    payload: DisconnectChannelPayload,
    delivery?: DeliveryContext
  ): Promise<void>;
  enqueueRecoverOutbox(payload: OutboxJobPayload): Promise<void>;
  enqueueRefreshChannelTokens(payload: ChannelJobPayload): Promise<void>;
  enqueueRepairChannelSubscriptions(payload: ChannelJobPayload): Promise<void>;
  enqueueSyncChannelInfo(payload: ChannelJobPayload): Promise<void>;
  enqueueSyncChannelListings(
    payload: SyncChannelListingsPayload,
    delivery?: DeliveryContext,
    options?: { delayMs?: number }
  ): Promise<void>;
  enqueueSyncChannelOrders(
    payload: SyncChannelOrdersPayload,
    options?: {
      /**
       * The listings processor's post-watermark chain enqueue. Uses its own
       * dedup id: the plain "orders" id can be held by an ACTIVE job that
       * read the gate before the listings watermark committed — that job
       * completes as a gated no-op AND silently swallows this add, losing
       * the first pull with no retry. A chain job is only enqueued after
       * the watermark exists, so it always performs a real pull.
       */
      chained?: boolean;
      delayMs?: number;
    }
  ): Promise<void>;
  enqueueSyncOrder(
    payload: SyncOrderPayload,
    delivery?: DeliveryContext
  ): Promise<void>;
  enqueueSyncShipment(payload: OutboxJobPayload): Promise<void>;
  /** Raw queue access for the worker's control plane (schedulers, sweeps). */
  queue(name: QueueName): Queue;
}

/**
 * Env-free producer factory. FAIL-FAST by design: `enableOfflineQueue:
 * false` makes an enqueue against a down Redis reject immediately instead
 * of buffering in process memory — the caller (webhook receiver, tRPC
 * mutation) must know the enqueue did not happen. Postgres is the durable
 * boundary; Redis is not allowed to pretend to be one.
 */
export function createJobClient(
  redisUrl: string,
  options: {
    /** Key prefix — tests isolate runs; production leaves the default. */
    prefix?: string;
  } = {}
): JobClient {
  const queues = new Map<QueueName, Queue>();

  const queue = (name: QueueName): Queue => {
    let existing = queues.get(name);
    if (!existing) {
      const topology = QUEUE_TOPOLOGY[name];
      existing = new Queue(name, {
        connection: {
          url: redisUrl,
          enableOfflineQueue: false,
        },
        ...(options.prefix ? { prefix: options.prefix } : {}),
        defaultJobOptions: {
          attempts: topology.attempts,
          backoff: { type: "exponential", delay: topology.backoffMs },
          ...DEFAULT_RETENTION,
        },
      });
      queues.set(name, existing);
    }
    return existing;
  };

  return {
    queue,

    async enqueueSyncOrder(payload, delivery) {
      await queue(QUEUES.syncOrders).add(JOBS.syncOrder, payload, {
        ...deliveryOptions(delivery),
        deduplication: dedup.order(payload.channelId, payload.orderReference),
      });
    },

    async enqueueSyncChannelOrders(payload, options) {
      await queue(QUEUES.syncOrders).add(JOBS.syncChannelOrders, payload, {
        deduplication: dedup.dispatch(
          options?.chained ? "orders-chain" : "orders",
          payload.channelId
        ),
        ...(options?.delayMs ? { delay: options.delayMs } : {}),
      });
    },

    async enqueueSyncChannelListings(payload, delivery, options) {
      // Dispatcher-driven (delayed) enqueues dedup while the job exists —
      // a TTL window would let delayed jobs pile up across 15-min ticks.
      // Webhook-driven enqueues keep the short fetch-latest window.
      const deduplication =
        options?.delayMs === undefined
          ? dedup.listings(payload.channelId)
          : dedup.dispatch("listings", payload.channelId);
      await queue(QUEUES.syncListings).add(JOBS.syncChannelListings, payload, {
        ...deliveryOptions(delivery),
        deduplication,
        ...(options?.delayMs ? { delay: options.delayMs } : {}),
      });
    },

    async enqueueArchiveListing(payload, delivery) {
      // NEVER coalesced: an archive and an update are not interchangeable.
      await queue(QUEUES.syncListings).add(
        JOBS.archiveListing,
        payload,
        deliveryOptions(delivery)
      );
    },

    async enqueueSyncShipment(payload) {
      await queue(QUEUES.syncShipments).add(JOBS.syncShipment, payload, {
        jobId: outboxJobId(payload.outboxId, payload.generation),
      });
    },

    async enqueueRecoverOutbox(payload) {
      await queue(QUEUES.syncShipments).add(JOBS.recoverOutbox, payload, {
        jobId: recoverOutboxJobId(payload.outboxId, payload.generation),
      });
    },

    async enqueueSyncChannelInfo(payload) {
      await queue(QUEUES.syncChannels).add(JOBS.syncChannelInfo, payload, {
        deduplication: dedup.dispatch("channel-info", payload.channelId),
      });
    },

    async enqueueRefreshChannelTokens(payload) {
      await queue(QUEUES.syncChannels).add(JOBS.refreshChannelTokens, payload, {
        deduplication: dedup.dispatch("refresh-tokens", payload.channelId),
      });
    },

    async enqueueDisconnectChannel(payload, delivery) {
      // NEVER coalesced: each disconnect carries its own generation.
      await queue(QUEUES.syncChannels).add(
        JOBS.disconnectChannel,
        payload,
        deliveryOptions(delivery)
      );
    },

    async enqueueRepairChannelSubscriptions(payload) {
      await queue(QUEUES.syncChannels).add(
        JOBS.repairChannelSubscriptions,
        payload,
        {
          deduplication: dedup.dispatch("subscriptions", payload.channelId),
        }
      );
    },

    async close() {
      await Promise.all([...queues.values()].map((q) => q.close()));
      queues.clear();
    },
  };
}
