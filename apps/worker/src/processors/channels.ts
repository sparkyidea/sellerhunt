import { channel } from "@dashseller/db/schema";
import {
  channelJobPayloadSchema,
  disconnectChannelPayloadSchema,
  JOBS,
  QUEUES,
} from "@dashseller/job-client";
import { createAppClient } from "@dashseller/marketplace";
import type { MarketplaceType } from "@dashseller/marketplace/types";
import { getApiErrorStatus } from "@dashseller/marketplace/utils";
import type { SyncContext } from "@dashseller/sync";
import {
  disconnectChannel,
  pullChannelInfo,
  reconcileChannelSubscriptions,
  recordDomainRun,
  TokenAuthError,
  TokenManager,
} from "@dashseller/sync";
import { eq } from "drizzle-orm";
import type { Registry } from "../registry";
import {
  type ChannelApiClientFactory,
  defaultApiClientFactory,
  throwIfRateLimited,
} from "./shared";

export interface ChannelsProcessorConfig {
  ebayVerificationToken: string;
  /** Public base URL of THIS worker; endpoints are `${webhookBaseUrl}/webhook/{marketplace}`. */
  webhookBaseUrl: string;
}

const EBAY_DESTINATION_NAME = "dashseller-webhooks";

/**
 * Channels domain processors: channel info refresh, proactive token
 * refresh, generation-fenced disconnects, and subscription repair.
 */
export function registerChannelProcessors(params: {
  apiClientFactory?: ChannelApiClientFactory;
  config: ChannelsProcessorConfig;
  ctx: SyncContext;
  registry: Registry;
}): void {
  const {
    ctx,
    registry,
    config,
    apiClientFactory = defaultApiClientFactory,
  } = params;

  registry.register(QUEUES.syncChannels, JOBS.syncChannelInfo, async (job) => {
    const payload = channelJobPayloadSchema.parse(job.data);
    const apiClient = await apiClientFactory(ctx, payload.channelId);
    try {
      return await pullChannelInfo(ctx, {
        apiClient,
        channelId: payload.channelId,
      });
    } catch (error) {
      throwIfRateLimited(error);
    }
  });

  registry.register(
    QUEUES.syncChannels,
    JOBS.refreshChannelTokens,
    async (job) => {
      const payload = channelJobPayloadSchema.parse(job.data);
      const { channelDetails, tokenData } = await TokenManager.loadForChannel(
        ctx,
        payload.channelId
      );
      const manager = new TokenManager(ctx, channelDetails, tokenData);
      const result = await manager.refreshIfNeeded(60);
      return { refreshed: result.refreshed };
    }
  );

  registry.register(
    QUEUES.syncChannels,
    JOBS.disconnectChannel,
    async (job) => {
      const payload = disconnectChannelPayloadSchema.parse(job.data);
      const outcome = await disconnectChannel(ctx, {
        channelId: payload.channelId,
        expectedGeneration: payload.connectionGeneration,
        reason: payload.reason,
        // The generation was stamped at webhook RECEIPT, so an event the
        // marketplace delayed until after a reconnect matches the fresh
        // connection's generation — only the marketplace itself can say
        // whether the grant this event describes is actually dead.
        verifyStillConnected: async () => {
          try {
            const apiClient = await apiClientFactory(ctx, payload.channelId);
            await apiClient.getChannel();
            return true;
          } catch (error) {
            if (
              error instanceof TokenAuthError ||
              getApiErrorStatus(error) === 401
            ) {
              return false;
            }
            // Rate limits, outages, anything ambiguous: rethrow so the
            // core falls back to the generation fence.
            throw error;
          }
        },
      });
      // Inconclusive verification on a matching generation: neither
      // disconnecting nor dropping is safe — throw so the queue's retry
      // policy re-runs the job until the marketplace answers.
      if (outcome.kind === "verify-inconclusive") {
        const attempts = job.opts.attempts ?? 1;
        if (job.attemptsMade + 1 < attempts) {
          throw new Error(
            `Grant verification inconclusive for channel ${payload.channelId} — retrying disconnect`
          );
        }
        // Final attempt. Delivery jobs are removed on failure (a retained
        // failed job would swallow the marketplace's redelivery), and
        // failing syncs keep last_run_at fresh, so a plain throw here
        // leaves NO durable trace of the unresolved destructive event.
        // Write a channels-domain marker instead — the ops alert pages on
        // the "Unresolved disconnect:" prefix until a reconnect or a
        // successful disconnect resolves it.
        const [row] = await ctx.db
          .select({ organizationId: channel.organizationId })
          .from(channel)
          .where(eq(channel.id, payload.channelId))
          .limit(1);
        if (row) {
          await recordDomainRun(ctx, {
            channelId: payload.channelId,
            domain: "channels",
            error: `Unresolved disconnect: ${payload.reason} — grant verification kept failing; verify the marketplace connection manually`,
            organizationId: row.organizationId,
            ranAt: ctx.clock.now(),
            success: false,
          });
        }
        return { outcome: "verify-exhausted" };
      }
      // still-connected, stale-generation and not-found are terminal: the
      // event was outrun by a reconnect (or the channel is gone) — never
      // retried, never coalesced with anything.
      return { outcome: outcome.kind };
    }
  );

  registry.register(
    QUEUES.syncChannels,
    JOBS.repairChannelSubscriptions,
    async (job) => {
      const payload = channelJobPayloadSchema.parse(job.data);
      const [row] = await ctx.db
        .select({ marketplaceId: channel.marketplaceId })
        .from(channel)
        .where(eq(channel.id, payload.channelId))
        .limit(1);
      if (!row) {
        return { outcome: "missing-channel" };
      }
      const marketplaceId = row.marketplaceId as MarketplaceType;
      const endpoint = new URL(
        `/webhook/${marketplaceId}`,
        config.webhookBaseUrl
      ).toString();

      try {
        // eBay binds subscriptions to an app-scoped destination object;
        // reconcile it first (idempotent) and pass its id down. Shopify
        // carries the URL on each subscription — no destination needed.
        let destinationId: string | undefined;
        if (marketplaceId === "ebay") {
          const appClient = createAppClient(
            marketplaceId,
            ctx.credentials.getAppCredentials(marketplaceId)
          );
          destinationId = await appClient.reconcileDestination?.({
            name: EBAY_DESTINATION_NAME,
            endpoint,
            verificationToken: config.ebayVerificationToken,
          });
        }

        const apiClient = await apiClientFactory(ctx, payload.channelId);
        const result = await reconcileChannelSubscriptions(ctx, {
          apiClient,
          channelId: payload.channelId,
          endpoint,
          destinationId,
        });
        return {
          outcome: "reconciled",
          topics: result.outcomes.length,
          problems: result.problems.length,
        };
      } catch (error) {
        throwIfRateLimited(error);
      }
    }
  );
}
