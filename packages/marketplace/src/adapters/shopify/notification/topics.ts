import type { NotificationEventType } from "../../../types";

export interface ShopifyTopicSpec {
  /**
   * Neutral event this topic normalizes to. Many-to-one is allowed, same as
   * eBay's catalogue.
   */
  eventType: NotificationEventType;
  /**
   * `WebhookSubscriptionTopic` enum member. Admin GraphQL only accepts this
   * spelling on the write side, so it exists purely as an API boundary value —
   * never store it, never compare against it outside this module.
   *
   * Rule: CHN-004 — vendor enums get renamed across API versions;
   * persisting one makes a version bump a data migration.
   */
  graphqlTopic: string;
  /**
   * Whether the webhook worker has a handler. Unhandled topics are archived as
   * `ignored` on arrival instead of waking a worker.
   *
   * Rule: CHN-005 — archived, not dropped and not dispatched.
   */
  handled: boolean;
  /**
   * `seller` topics get a per-shop subscription. No Shopify topic we want is
   * app-scoped today; the field exists so the catalogue reads the same as
   * eBay's and so a future app-scoped topic can't be silently subscribed.
   */
  scope: "app" | "seller";
  /**
   * Header/REST spelling (`orders/create`), which is what arrives on
   * `x-shopify-topic`. Canonical everywhere in our database — the GraphQL enum
   * never leaves this file's neighbours.
   */
  topic: string;
}

/**
 * The topics we've opted into. Every entry is handled: unlike eBay, we do NOT
 * subscribe broadly to collect payload samples.
 *
 * eBay's topics are registered once against a keyset and cost nothing per
 * seller, so over-subscribing there is free reconnaissance. A Shopify
 * subscription is a per-shop API write during the OAuth callback (user-visible
 * latency), and Shopify DELETES an API-created subscription after 8 consecutive
 * failed deliveries — so an unhandled topic buys nothing and adds a way for a
 * receiver hiccup to tear down real subscriptions.
 *
 * The GDPR compliance topics (`customers/data_request`, `customers/redact`,
 * `shop/redact`) are deliberately absent. They are mandatory only for apps
 * distributed through the Shopify App Store; this is a custom per-merchant app,
 * and they are configured in the Partner dashboard rather than subscribed via
 * the Admin API anyway.
 */
export const SHOPIFY_TOPICS = [
  {
    eventType: "order.created",
    graphqlTopic: "ORDERS_CREATE",
    handled: true,
    scope: "seller",
    topic: "orders/create",
  },
  {
    // Fires on EVERY order mutation, including financial-status changes.
    // That is a deliberate decision: paid (orders/paid), refunds
    // (refunds/create), and orders/partially_fulfilled are NOT subscribed —
    // this topic subsumes them, and the handler fetches full order state
    // anyway, so finer-grained topics would only add duplicate deliveries.
    eventType: "order.updated",
    graphqlTopic: "ORDERS_UPDATED",
    handled: true,
    scope: "seller",
    topic: "orders/updated",
  },
  {
    eventType: "order.shipped",
    graphqlTopic: "ORDERS_FULFILLED",
    handled: true,
    scope: "seller",
    topic: "orders/fulfilled",
  },
  {
    eventType: "order.canceled",
    graphqlTopic: "ORDERS_CANCELLED",
    handled: true,
    scope: "seller",
    topic: "orders/cancelled",
  },
  {
    eventType: "listing.created",
    graphqlTopic: "PRODUCTS_CREATE",
    handled: true,
    scope: "seller",
    topic: "products/create",
  },
  {
    eventType: "listing.updated",
    graphqlTopic: "PRODUCTS_UPDATE",
    handled: true,
    scope: "seller",
    topic: "products/update",
  },
  {
    // Tombstone. The delete payload carries no product state, so the
    // handler archives by reference with `x-shopify-triggered-at` as the
    // version clock — an older update can never un-archive the row.
    eventType: "listing.deleted",
    graphqlTopic: "PRODUCTS_DELETE",
    handled: true,
    scope: "seller",
    topic: "products/delete",
  },
  {
    eventType: "authorization.revoked",
    graphqlTopic: "APP_UNINSTALLED",
    handled: true,
    scope: "seller",
    topic: "app/uninstalled",
  },
] as const satisfies readonly ShopifyTopicSpec[];

/** Header topics the webhook worker must implement a handler for. */
export type ShopifyHandledTopic = Extract<
  (typeof SHOPIFY_TOPICS)[number],
  { handled: true }
>["topic"];

/** Widens the `as const` literal types so runtime checks aren't narrowed away. */
const ALL_TOPICS: readonly ShopifyTopicSpec[] = SHOPIFY_TOPICS;

const TOPICS_BY_TOPIC = new Map<string, ShopifyTopicSpec>(
  ALL_TOPICS.map((spec) => [spec.topic, spec])
);

const TOPICS_BY_GRAPHQL_TOPIC = new Map<string, ShopifyTopicSpec>(
  ALL_TOPICS.map((spec) => [spec.graphqlTopic, spec])
);

export function getShopifyTopicSpec(
  topic: string
): ShopifyTopicSpec | undefined {
  return TOPICS_BY_TOPIC.get(topic);
}

/** Unknown and unsubscribed topics count as unhandled. */
export function isShopifyTopicHandled(topic: string): boolean {
  return getShopifyTopicSpec(topic)?.handled ?? false;
}

/** Topics subscribed per shop. */
export function getSubscribableShopifyTopics(): ShopifyTopicSpec[] {
  return ALL_TOPICS.filter((spec) => spec.scope === "seller");
}

/** Header spelling → Admin GraphQL enum, for the subscription write path. */
export function toShopifyGraphqlTopic(topic: string): string | undefined {
  return getShopifyTopicSpec(topic)?.graphqlTopic;
}

/**
 * Admin GraphQL enum → header spelling, for reading back existing
 * subscriptions. Undefined for topics outside our catalogue — including ones a
 * previous version of this app subscribed to.
 */
export function fromShopifyGraphqlTopic(
  graphqlTopic: string
): string | undefined {
  return TOPICS_BY_GRAPHQL_TOPIC.get(graphqlTopic)?.topic;
}
