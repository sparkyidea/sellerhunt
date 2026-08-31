import { createHash } from "node:crypto";

/**
 * Job id for a webhook-delivery-driven domain job. Colon-free (BullMQ uses
 * colons as key separators); the hash keeps marketplace delivery ids —
 * arbitrary provider strings — bounded and safe.
 */
export function deliveryJobId(marketplace: string, deliveryId: string): string {
  const digest = createHash("sha256")
    .update(deliveryId, "utf8")
    .digest("hex")
    .slice(0, 32);
  return `${marketplace}-${digest}`;
}

/** Fenced outbox job id: `outbox-{rowId}-{claimGeneration}`. */
export function outboxJobId(rowId: string, generation: number): string {
  return `outbox-${rowId}-${generation}`;
}

/** Recovery job id: `recover-outbox-{rowId}-{claimGeneration}`. */
export function recoverOutboxJobId(rowId: string, generation: number): string {
  return `recover-outbox-${rowId}-${generation}`;
}

/**
 * Semantic coalescing ids — ONLY for interchangeable fetch-latest work.
 * Never for disconnects, archive-vs-update, or distinct stock transitions.
 */
export const dedup = {
  /** Same order fetched twice within the window collapses. */
  order: (channelId: string, resourceId: string) =>
    ({ id: `order-${channelId}-${resourceId}`, ttl: 3000 }) as const,
  /** Channel-wide listing pulls collapse. */
  listings: (channelId: string) =>
    ({ id: `listings-${channelId}`, ttl: 30_000 }) as const,
  /** Per-channel dispatcher fan-out collapses while a job is queued. */
  dispatch: (domain: string, channelId: string) =>
    ({ id: `${domain}-${channelId}` }) as const,
};
