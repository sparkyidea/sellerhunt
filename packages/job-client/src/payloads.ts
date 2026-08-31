import { z } from "zod";

/**
 * Webhook delivery envelope, attached to domain jobs the receiver
 * enqueues. Versioned; dates travel as ISO strings and are coerced back
 * to Date at the worker boundary. `providerEventAt` is REQUIRED for
 * Shopify (from `X-Shopify-Triggered-At`) — the receiver enforces that;
 * the schema keeps it nullable because eBay deliveries have no equivalent.
 */
export const webhookEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  provider: z.enum(["ebay", "shopify"]),
  eventType: z.string().min(1),
  externalDeliveryId: z.string().min(1),
  externalResourceId: z.string().nullable(),
  channelId: z.string().min(1),
  connectionGeneration: z.string().min(1),
  receivedAt: z.iso.datetime(),
  providerEventAt: z.iso.datetime().nullable(),
});
export type WebhookEnvelope = z.infer<typeof webhookEnvelopeSchema>;

export const syncOrderPayloadSchema = z.object({
  channelId: z.string().min(1),
  orderReference: z.string().min(1),
  envelope: webhookEnvelopeSchema.optional(),
});
export type SyncOrderPayload = z.infer<typeof syncOrderPayloadSchema>;

export const syncChannelOrdersPayloadSchema = z.object({
  channelId: z.string().min(1),
  forceRefresh: z.boolean().default(false),
});
export type SyncChannelOrdersPayload = z.infer<
  typeof syncChannelOrdersPayloadSchema
>;

export const syncChannelListingsPayloadSchema = z.object({
  channelId: z.string().min(1),
  forceRefresh: z.boolean().default(false),
});
export type SyncChannelListingsPayload = z.infer<
  typeof syncChannelListingsPayloadSchema
>;

export const archiveListingPayloadSchema = z.object({
  channelId: z.string().min(1),
  listingReference: z.string().min(1),
  /** Tombstone version clock (Shopify providerEventAt), ISO string. */
  tombstoneVersionAt: z.iso.datetime(),
  envelope: webhookEnvelopeSchema.optional(),
});
export type ArchiveListingPayload = z.infer<typeof archiveListingPayloadSchema>;

/** Fenced outbox jobs — generation travels in the payload. */
export const outboxJobPayloadSchema = z.object({
  outboxId: z.string().min(1),
  generation: z.number().int().min(0),
});
export type OutboxJobPayload = z.infer<typeof outboxJobPayloadSchema>;

export const channelJobPayloadSchema = z.object({
  channelId: z.string().min(1),
});
export type ChannelJobPayload = z.infer<typeof channelJobPayloadSchema>;

export const disconnectChannelPayloadSchema = z.object({
  channelId: z.string().min(1),
  /** Generation the delivery was resolved under — the disconnect fence. */
  connectionGeneration: z.string().min(1),
  reason: z.string().min(1),
  envelope: webhookEnvelopeSchema.optional(),
});
export type DisconnectChannelPayload = z.infer<
  typeof disconnectChannelPayloadSchema
>;

/** Dispatcher ticks carry no payload. */
export const emptyPayloadSchema = z.object({}).strict();
