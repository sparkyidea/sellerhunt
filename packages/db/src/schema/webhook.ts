import { type InferSelectModel, relations } from "drizzle-orm";
import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { channel } from "./channel";

/**
 * Marketplace-side notification subscriptions we manage per channel (e.g.
 * eBay ORDER_CONFIRMATION created with the seller's token at connect time).
 * Lets reconnects be idempotent, and disconnects/diagnostics find what was
 * registered remotely.
 *
 * There is deliberately no webhook inbox table: inbound deliveries are
 * verified and enqueued directly to the job queue; Redis durability plus
 * periodic reconciliation sweeps are the recovery path. (`webhookDelivery`
 * below is a passive log, not an inbox — nothing processes from it.)
 */
export const channelWebhookSubscription = pgTable(
  "channel_webhook_subscription",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelId: text("channel_id")
      .notNull()
      .references(() => channel.id, { onDelete: "cascade" }),
    /**
     * The marketplace's delivery/header spelling — `orders/create`,
     * `ORDER_CONFIRMATION`. Same vocabulary as the adapter's
     * `AppClient.getSellerTopics()`, so a subscription can be matched to the
     * events it produced by string equality. Shopify's GraphQL enum
     * spelling (`ORDERS_CREATE`) is confined to the API boundary and never
     * reaches this column.
     */
    topic: text("topic").notNull(),
    /**
     * Marketplace-assigned subscription id, stored exactly as returned. For
     * Shopify that is the FULL gid (`gid://shopify/WebhookSubscription/123`),
     * not a stripped numeric id: it is an opaque handle passed straight back
     * to `webhookSubscriptionDelete` and never shown to a user. (Contrast
     * `order.reference`, which IS stripped — it's user-facing.)
     */
    subscriptionId: text("subscription_id").notNull(),
    /** Marketplace-assigned destination (endpoint registration) id, if any. */
    destinationId: text("destination_id"),
    status: text("status").notNull().default("enabled"),
    error: text("error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("channel_webhook_subscription_channel_topic_unique").on(
      table.channelId,
      table.topic
    ),
  ]
);

export const channelWebhookSubscriptionRelations = relations(
  channelWebhookSubscription,
  ({ one }) => ({
    channel: one(channel, {
      fields: [channelWebhookSubscription.channelId],
      references: [channel.id],
    }),
  })
);

export type SelectChannelWebhookSubscription = InferSelectModel<
  typeof channelWebhookSubscription
>;

/**
 * Append-only log of verified inbound deliveries — observability ONLY, not
 * an inbox. The receiver writes it fire-and-forget AFTER signature
 * verification and NEVER reads it: processing durability stays with the
 * job queue, so a failed write here can't lose or duplicate an event.
 * Rows for unverified requests are deliberately impossible — the endpoint
 * is public and logging forgeries would hand attackers a DB-write.
 *
 * A redelivery upserts onto (marketplace, delivery_id), bumping `attempts`
 * and overwriting `outcome` with the latest disposition — so a row reading
 * `attempts: 3` is a marketplace retry story in one line.
 */
export const webhookDelivery = pgTable(
  "webhook_delivery",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marketplace: text("marketplace").notNull(),
    /** Marketplace-assigned delivery/event id — the redelivery dedup key. */
    deliveryId: text("delivery_id").notNull(),
    topic: text("topic").notNull(),
    /** Neutral `NotificationEventType` the topic normalized to. */
    eventType: text("event_type").notNull(),
    resourceId: text("resource_id"),
    /**
     * No FK: log rows must survive channel deletion (that history is when
     * they matter most) and must never block it.
     */
    channelId: text("channel_id"),
    /** enqueued | ignored | ineligible | unattributed | enqueue_failed */
    outcome: text("outcome").notNull(),
    attempts: integer("attempts").notNull().default(1),
    /**
     * Verified raw body — the reference for payload-shape questions and
     * the sample source for topics subscribed but not yet handled.
     */
    payload: jsonb("payload"),
    receivedAt: timestamp("received_at").defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("webhook_delivery_marketplace_delivery_unique").on(
      table.marketplace,
      table.deliveryId
    ),
  ]
);

export type SelectWebhookDelivery = InferSelectModel<typeof webhookDelivery>;
