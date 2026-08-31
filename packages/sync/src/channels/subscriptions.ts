import { channelWebhookSubscription } from "@dashseller/db/schema";
import type {
  ApiClient,
  SubscriptionResult,
} from "@dashseller/marketplace/types";
import { and, eq, notInArray } from "drizzle-orm";
import type { SyncContext } from "../context";

export interface ReconcileChannelSubscriptionsResult {
  outcomes: SubscriptionResult[];
  /** Topics whose subscription could not be established. */
  problems: SubscriptionResult[];
}

/**
 * Create/repair a channel's marketplace notification subscriptions and
 * persist the per-topic outcome rows. Idempotent — runs at connect and is
 * re-run by the periodic repair dispatcher; the endpoint and (for eBay)
 * destinationId are injected by the caller, which owns env/config.
 *
 * Adapters without a subscription API (`reconcileSubscriptions` absent)
 * return empty outcomes — nothing to persist, nothing to repair.
 */
export async function reconcileChannelSubscriptions(
  ctx: SyncContext,
  params: {
    apiClient: ApiClient;
    channelId: string;
    destinationId?: string;
    endpoint: string;
  }
): Promise<ReconcileChannelSubscriptionsResult> {
  if (!params.apiClient.reconcileSubscriptions) {
    return { outcomes: [], problems: [] };
  }

  const outcomes = await params.apiClient.reconcileSubscriptions({
    endpoint: params.endpoint,
    destinationId: params.destinationId,
  });

  // Persist what the marketplace now has: enabled topics upserted, topics
  // we no longer hold (removed/unavailable) dropped, errors kept visible.
  const keepTopics: string[] = [];
  for (const outcome of outcomes) {
    if (outcome.status === "enabled" && outcome.subscriptionId) {
      keepTopics.push(outcome.topic);
      await ctx.db
        .insert(channelWebhookSubscription)
        .values({
          channelId: params.channelId,
          topic: outcome.topic,
          subscriptionId: outcome.subscriptionId,
          destinationId: outcome.destinationId ?? params.destinationId ?? null,
          status: "enabled",
          error: null,
        })
        .onConflictDoUpdate({
          target: [
            channelWebhookSubscription.channelId,
            channelWebhookSubscription.topic,
          ],
          set: {
            subscriptionId: outcome.subscriptionId,
            destinationId:
              outcome.destinationId ?? params.destinationId ?? null,
            status: "enabled",
            error: null,
            updatedAt: new Date(),
          },
        });
    } else if (outcome.status === "error") {
      keepTopics.push(outcome.topic);
      await ctx.db
        .insert(channelWebhookSubscription)
        .values({
          channelId: params.channelId,
          topic: outcome.topic,
          subscriptionId: outcome.subscriptionId ?? "",
          destinationId: outcome.destinationId ?? params.destinationId ?? null,
          status: "error",
          error: outcome.error ?? "subscription failed",
        })
        .onConflictDoUpdate({
          target: [
            channelWebhookSubscription.channelId,
            channelWebhookSubscription.topic,
          ],
          set: {
            status: "error",
            error: outcome.error ?? "subscription failed",
            updatedAt: new Date(),
          },
        });
    }
  }

  await ctx.db
    .delete(channelWebhookSubscription)
    .where(
      keepTopics.length > 0
        ? and(
            eq(channelWebhookSubscription.channelId, params.channelId),
            notInArray(channelWebhookSubscription.topic, keepTopics)
          )
        : eq(channelWebhookSubscription.channelId, params.channelId)
    );

  const problems = outcomes.filter((o) => o.status === "error");
  if (problems.length > 0) {
    ctx.logger.warn("Subscription reconcile reported problems", {
      channelId: params.channelId,
      problems: problems.map((p) => `${p.topic}: ${p.error ?? p.status}`),
    });
  }
  return { outcomes, problems };
}
