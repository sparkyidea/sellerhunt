/**
 * Queue topology — five domain queues, one apps/worker. Correctness lives
 * in the database (unique constraints, fenced transitions, narrow locks);
 * these numbers are throughput/backpressure tuning only.
 *
 * Tracking is deliberately absent: carrier polling stays on Trigger.dev
 * (`poll-tracking` in packages/trigger-sync) — the worker owns
 * marketplace sync only.
 */
export const QUEUES = {
  syncControl: "sync-control",
  syncOrders: "sync-orders",
  syncListings: "sync-listings",
  syncShipments: "sync-shipments",
  syncChannels: "sync-channels",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export const JOBS = {
  // sync-control
  dispatchChannelSyncs: "dispatch-channel-syncs",
  dispatchSubscriptionRepairs: "dispatch-subscription-repairs",
  dispatchOutboxRecovery: "dispatch-outbox-recovery",
  drainSyncOutbox: "drain-sync-outbox",
  outboxStaleReset: "outbox-stale-reset",
  outboxSendingSweep: "outbox-sending-sweep",
  outboxConflictEscalation: "outbox-conflict-escalation",
  outboxCleanup: "outbox-cleanup",
  // sync-orders
  syncOrder: "sync-order",
  syncChannelOrders: "sync-channel-orders",
  // sync-listings
  syncChannelListings: "sync-channel-listings",
  archiveListing: "archive-listing",
  // sync-shipments
  syncShipment: "sync-shipment",
  recoverOutbox: "recover-outbox",
  // sync-channels
  syncChannelInfo: "sync-channel-info",
  refreshChannelTokens: "refresh-channel-tokens",
  disconnectChannel: "disconnect-channel",
  repairChannelSubscriptions: "repair-channel-subscriptions",
} as const;

export type JobName = (typeof JOBS)[keyof typeof JOBS];

export interface QueueTopologyEntry {
  /** Retry attempts before a job lands in failed. */
  attempts: number;
  /** Exponential backoff base (ms); BullMQ adds jitter via the worker. */
  backoffMs: number;
  /** Per-queue `setGlobalConcurrency` value (applies across workers). */
  globalConcurrency: number;
  /** Per-worker concurrency for this queue. */
  localConcurrency: number;
  /** Worker lock duration (ms) sized to the job class's runtime. */
  lockDurationMs: number;
}

export const QUEUE_TOPOLOGY: Record<QueueName, QueueTopologyEntry> = {
  [QUEUES.syncControl]: {
    localConcurrency: 2,
    globalConcurrency: 2,
    attempts: 3,
    backoffMs: 5000,
    lockDurationMs: 60_000,
  },
  [QUEUES.syncOrders]: {
    localConcurrency: 5,
    globalConcurrency: 10,
    attempts: 5,
    backoffMs: 5000,
    lockDurationMs: 5 * 60_000,
  },
  [QUEUES.syncListings]: {
    localConcurrency: 3,
    globalConcurrency: 6,
    attempts: 3,
    backoffMs: 10_000,
    lockDurationMs: 10 * 60_000,
  },
  [QUEUES.syncShipments]: {
    localConcurrency: 5,
    globalConcurrency: 10,
    attempts: 5,
    backoffMs: 5000,
    lockDurationMs: 2 * 60_000,
  },
  [QUEUES.syncChannels]: {
    localConcurrency: 3,
    globalConcurrency: 6,
    attempts: 4,
    backoffMs: 5000,
    lockDurationMs: 2 * 60_000,
  },
};

/** Retention for non-delivery jobs: by age AND count. */
export const DEFAULT_RETENTION = {
  removeOnComplete: { age: 24 * 3600, count: 5000 },
  removeOnFail: { age: 7 * 24 * 3600, count: 5000 },
} as const;
