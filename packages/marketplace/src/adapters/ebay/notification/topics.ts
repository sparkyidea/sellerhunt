import type { NotificationEventType } from "../../../types";

export interface EbayTopicSpec {
  /**
   * Neutral event this topic normalizes to. Many-to-one is expected —
   * BUYER_QUESTION and NEW_MESSAGE are the same event to us.
   */
  eventType: NotificationEventType;
  /**
   * Whether {@link processWebhookEvent} has a handler. Unhandled topics are
   * archived as `ignored` on arrival instead of waking a worker.
   */
  handled: boolean;
  /**
   * `seller` topics get a per-channel subscription; `app` topics are registered
   * once in the developer portal. Mirrors eBay's `scope` field (USER |
   * APPLICATION), NOT its `context` field — BUYER_QUESTION is context
   * DEVELOPER yet scope USER.
   */
  scope: "app" | "seller";
  /** eBay topic id, e.g. ORDER_CONFIRMATION. */
  topicId: string;
}

/**
 * The topics we've opted into — not eBay's full catalogue of 26. Membership is
 * the decision: every `seller` entry gets subscribed per channel, and every
 * event costs a webhook-inbox row.
 *
 * For what else is available, run
 * `sandbox/ebay/direct-api/get-notification-topics.ts` — it reports the live
 * catalogue rather than duplicating it here. Verified 2026-08-04.
 */
export const EBAY_TOPICS = [
  {
    topicId: "ORDER_CONFIRMATION",
    eventType: "order.created",
    scope: "seller",
    handled: true,
  },
  {
    topicId: "ITEM_MARKED_SHIPPED",
    eventType: "order.shipped",
    scope: "seller",
    handled: true,
  },
  {
    topicId: "MARKETPLACE_ACCOUNT_DELETION",
    eventType: "account.closed",
    scope: "app",
    handled: true,
  },
  {
    topicId: "AUTHORIZATION_REVOCATION",
    eventType: "authorization.revoked",
    scope: "app",
    handled: true,
  },
  // Subscribed but not yet handled — payloads are archived as samples for
  // whoever writes the handler.
  //
  // LISTING and the return/cancellation/inquiry topics belong here too, but
  // their scopes aren't grantable to this keyset yet — see auth/scopes.ts.
  {
    topicId: "BUYER_QUESTION",
    eventType: "message.received",
    scope: "seller",
    handled: false,
  },
  {
    topicId: "NEW_MESSAGE",
    eventType: "message.received",
    scope: "seller",
    handled: false,
  },
  {
    topicId: "FEEDBACK_RECEIVED",
    eventType: "feedback.received",
    scope: "seller",
    handled: false,
  },
] as const satisfies readonly EbayTopicSpec[];

/** Topic ids `processWebhookEvent` must implement a handler for. */
export type EbayHandledTopicId = Extract<
  (typeof EBAY_TOPICS)[number],
  { handled: true }
>["topicId"];

/** Widens the `as const` literal types so runtime checks aren't narrowed away. */
const ALL_TOPICS: readonly EbayTopicSpec[] = EBAY_TOPICS;

const TOPICS_BY_ID = new Map<string, EbayTopicSpec>(
  ALL_TOPICS.map((topic) => [topic.topicId, topic])
);

export function getEbayTopicSpec(topicId: string): EbayTopicSpec | undefined {
  return TOPICS_BY_ID.get(topicId);
}

/** Unknown and unsubscribed topics count as unhandled. */
export function isEbayTopicHandled(topicId: string): boolean {
  return getEbayTopicSpec(topicId)?.handled ?? false;
}

/**
 * Topics subscribed per channel. `app` topics are excluded — they're
 * registered once in the developer portal, not per seller.
 *
 * No scope pre-filter: if the seller's token lacks a topic's scope, eBay
 * answers 195011 and {@link reconcileTopicSubscription} records it as
 * `unavailable`, which is both more accurate and self-updating.
 */
export function getSubscribableEbayTopics(): EbayTopicSpec[] {
  return ALL_TOPICS.filter((topic) => topic.scope === "seller");
}
