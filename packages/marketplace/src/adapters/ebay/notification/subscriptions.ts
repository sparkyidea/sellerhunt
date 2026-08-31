import type eBayApi from "ebay-api";
import { EBayApiError } from "ebay-api/lib/errors";
import type { SubscriptionResult } from "../../../types";
import { collectPages, PAGE_LIMIT } from "./helper/paging";
import { type EbayTopicSpec, getSubscribableEbayTopics } from "./topics";

/** Notification API error codes we act on, from eBay's published list. */
const NOT_AUTHORIZED_FOR_TOPIC = 195_011;
const SUBSCRIPTION_ALREADY_EXISTS = 195_012;

interface SubscriptionRecord {
  destinationId?: string;
  status?: string;
  subscriptionId?: string;
  topicId?: string;
}

interface TopicRecord {
  status?: string;
  supportedPayloads?: Array<{
    schemaVersion?: string;
    format?: string[];
    deliveryProtocol?: string;
    deprecated?: boolean;
  }>;
  topicId?: string;
}

function getSubscriptionsPage(client: eBayApi, continuationToken?: string) {
  return client.commerce.notification.getSubscriptions({
    limit: PAGE_LIMIT,
    continuationToken,
  });
}

async function findSubscriptionByTopic(
  client: eBayApi,
  topicId: string
): Promise<SubscriptionRecord | undefined> {
  const subscriptions = await collectPages<SubscriptionRecord>(
    (continuationToken) => getSubscriptionsPage(client, continuationToken),
    "subscriptions"
  );
  return subscriptions.find((s) => s.topicId === topicId);
}

/** Point an existing subscription at our destination and make sure it's live. */
async function repairSubscription(args: {
  client: eBayApi;
  destinationId: string;
  existing: SubscriptionRecord;
  subscriptionId: string;
  topicId: string;
}): Promise<SubscriptionResult> {
  const { client, destinationId, existing, subscriptionId, topicId } = args;
  if (existing.destinationId !== destinationId) {
    await client.commerce.notification.updateSubscription(subscriptionId, {
      destinationId,
    });
  }
  if (existing.status !== "ENABLED") {
    await client.commerce.notification.enableSubscription(subscriptionId);
  }
  return { topic: topicId, status: "enabled", subscriptionId, destinationId };
}

async function createTopicSubscription(args: {
  client: eBayApi;
  destinationId: string;
  topic: TopicRecord;
  topicId: string;
}): Promise<SubscriptionResult> {
  const { client, destinationId, topic, topicId } = args;
  const payloadDetail = topic.supportedPayloads?.find((p) => !p.deprecated);
  const created = (await client.commerce.notification.createSubscription({
    topicId,
    status: "ENABLED",
    destinationId,
    payload: {
      format: "JSON",
      schemaVersion: payloadDetail?.schemaVersion ?? "1.0",
      deliveryProtocol: payloadDetail?.deliveryProtocol ?? "HTTPS",
    },
  })) as { subscriptionId?: string } | undefined;

  // 201 hides the id in the Location header (same as reconcileDestination).
  const subscriptionId =
    created?.subscriptionId ??
    (await findSubscriptionByTopic(client, topicId))?.subscriptionId;

  if (!subscriptionId) {
    return {
      topic: topicId,
      status: "error",
      error: "Subscription created but could not be resolved",
    };
  }
  return { topic: topicId, status: "enabled", subscriptionId, destinationId };
}

/**
 * Reconcile one topic against eBay: reuse and repair an existing subscription
 * when present, otherwise create one. Returns a per-topic outcome rather than
 * throwing, so one bad topic can't abort the rest of the channel connect.
 */
async function reconcileTopicSubscription(args: {
  client: eBayApi;
  spec: EbayTopicSpec;
  topic: TopicRecord | undefined;
  existing: SubscriptionRecord | undefined;
  destinationId: string;
}): Promise<SubscriptionResult> {
  const { client, spec, topic, existing, destinationId } = args;

  if (!topic?.topicId || topic.status === "DISABLED") {
    return {
      topic: spec.topicId,
      status: "unavailable",
      error: `Topic not available for this keyset (${topic?.status ?? "absent"})`,
    };
  }

  try {
    return existing?.subscriptionId
      ? await repairSubscription({
          client,
          destinationId,
          existing,
          subscriptionId: existing.subscriptionId,
          topicId: spec.topicId,
        })
      : await createTopicSubscription({
          client,
          destinationId,
          topic,
          topicId: spec.topicId,
        });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const errorCode =
      error instanceof EBayApiError ? error.errorCode : undefined;

    // Already subscribed — a concurrent connect, or it appeared after our
    // initial read. The desired state holds, so resolve the id and report it.
    if (errorCode === SUBSCRIPTION_ALREADY_EXISTS) {
      const found = await findSubscriptionByTopic(client, spec.topicId);
      if (found?.subscriptionId) {
        return {
          topic: spec.topicId,
          status: "enabled",
          subscriptionId: found.subscriptionId,
          destinationId,
        };
      }
    }

    return {
      topic: spec.topicId,
      // Not authorized is a property of the keyset, not a failure to chase.
      status: errorCode === NOT_AUTHORIZED_FOR_TOPIC ? "unavailable" : "error",
      error: message,
    };
  }
}

/** Delete a subscription we no longer want. Reports failure rather than throwing. */
async function removeTopicSubscription(
  client: eBayApi,
  subscription: SubscriptionRecord & { subscriptionId: string }
): Promise<SubscriptionResult> {
  const topic = subscription.topicId ?? "UNKNOWN";
  try {
    await client.commerce.notification.deleteSubscription(
      subscription.subscriptionId
    );
    return { topic, status: "removed" };
  } catch (error) {
    return {
      topic,
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Reconcile a channel's eBay subscriptions with {@link
 * getSubscribableEbayTopics}: create/repair what we want, delete what we don't.
 * Called with the seller's fresh tokens at connect; safe to re-run.
 *
 * Takes the caller's seller client instead of building its own: `EbayApiClient
 * .refresh()` swaps out `this.client`, so a privately-built one would keep
 * signing calls with tokens the caller has already rotated away.
 *
 * Seller-token work only. The destination these subscriptions point at is
 * app-scoped, so the caller registers it through an `AppClient` and passes the
 * resulting `destinationId` in.
 */
export async function reconcileEbayChannelSubscriptions(
  client: eBayApi,
  destinationId: string
): Promise<SubscriptionResult[]> {
  const specs = getSubscribableEbayTopics();

  // One paged read each rather than a lookup per topic — this runs inside the
  // OAuth callback, so latency is user-visible.
  const [topics, existingSubscriptions] = await Promise.all([
    collectPages<TopicRecord>(
      (continuationToken) =>
        client.commerce.notification.getTopics({
          limit: PAGE_LIMIT,
          continuationToken,
        }),
      "topics"
    ),
    collectPages<SubscriptionRecord>(
      (continuationToken) => getSubscriptionsPage(client, continuationToken),
      "subscriptions"
    ),
  ]);

  const topicsById = new Map(topics.map((t) => [t.topicId, t]));
  const subscriptionsByTopic = new Map(
    existingSubscriptions.map((s) => [s.topicId, s])
  );

  const results: SubscriptionResult[] = [];

  for (const spec of specs) {
    // Sequential: eBay throttles notification writes.
    const result = await reconcileTopicSubscription({
      client,
      spec,
      topic: topicsById.get(spec.topicId),
      existing: subscriptionsByTopic.get(spec.topicId),
      destinationId,
    });
    results.push(result);
  }

  const desiredTopics = new Set(specs.map((spec) => spec.topicId));
  for (const subscription of existingSubscriptions) {
    if (
      !subscription.subscriptionId ||
      (subscription.topicId && desiredTopics.has(subscription.topicId))
    ) {
      continue;
    }
    results.push(
      await removeTopicSubscription(client, {
        ...subscription,
        subscriptionId: subscription.subscriptionId,
      })
    );
  }

  return results;
}

/**
 * Delete every notification subscription this seller holds with our app,
 * including topics no longer in our catalogue.
 *
 * The counterpart to {@link reconcileEbayChannelSubscriptions}, for when a
 * channel is removed. Subscriptions live on eBay's side bound to the seller's
 * grant, so dropping our `channel_webhook_subscription` rows only makes us
 * forget them — eBay keeps delivering, and once the channel's token is gone
 * there is no way left to authenticate the cancellation.
 *
 * The destination is deliberately untouched: it's app-scoped and shared by
 * every channel, so deleting it would silence notifications for all of them.
 */
export async function removeEbayChannelSubscriptions(
  client: eBayApi
): Promise<SubscriptionResult[]> {
  const subscriptions = await collectPages<SubscriptionRecord>(
    (continuationToken) => getSubscriptionsPage(client, continuationToken),
    "subscriptions"
  );

  const results: SubscriptionResult[] = [];
  for (const subscription of subscriptions) {
    if (!subscription.subscriptionId) {
      continue;
    }
    // Sequential: eBay throttles notification writes.
    results.push(
      await removeTopicSubscription(client, {
        ...subscription,
        subscriptionId: subscription.subscriptionId,
      })
    );
  }
  return results;
}
