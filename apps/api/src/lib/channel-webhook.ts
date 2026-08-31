import { channelWebhookSubscription } from "@dashseller/db/schema";
import { env } from "@dashseller/env/server";
import { createApiClient, createAppClient } from "@dashseller/marketplace";
import type {
  ApiClient,
  AppClient,
  AppConfig,
  MarketplaceType,
} from "@dashseller/marketplace/types";
import { reconcileChannelSubscriptions } from "@dashseller/sync";
import { eq } from "drizzle-orm";
import { getAppCredentials } from "./marketplace-credentials";
import { getApiSyncContext } from "./sync-context";

const EBAY_DESTINATION_NAME = "dashseller-webhooks";

/**
 * The exact public URL a marketplace knows our receiver by — on the
 * WORKER, not this API. Must byte-match what was registered (portal form
 * / createDestination) — it's an input to the challenge hash.
 */
export function getWebhookEndpoint(marketplaceId: string): string {
  return new URL(`/webhook/${marketplaceId}`, env.WEBHOOK_BASE_URL).toString();
}

/**
 * App-token client for marketplaces that have one, null for the rest —
 * `createAppClient` throws rather than returning a stub.
 */
function resolveAppClient(
  marketplaceId: MarketplaceType,
  config: AppConfig
): AppClient | null {
  try {
    return createAppClient(marketplaceId, config);
  } catch {
    return null;
  }
}

export interface ChannelTokenArgs {
  accessToken: string;
  channelId: string;
  marketplaceId: MarketplaceType;
  refreshToken: string | null;
  shopUrl?: string;
}

function buildApiClient(args: ChannelTokenArgs): ApiClient {
  const credentials = getAppCredentials(args.marketplaceId);
  return createApiClient(args.marketplaceId, {
    ...credentials,
    accessToken: args.accessToken,
    refreshToken: args.refreshToken,
    shopUrl: args.shopUrl,
  });
}

/**
 * Reconcile a channel's notification subscriptions, with every outcome
 * persisted INSIDE this protective wrapper: the happy path delegates to
 * the `@dashseller/sync` core (which records per-topic rows), and a
 * whole-batch failure — destination registration, auth, network — writes
 * an error row per seller topic so the repair dispatcher has something to
 * chew on. NEVER throws: a connect must not fail because subscriptions
 * did; polling still covers sync until the repair tick fixes them.
 *
 * Rule: CHN-003 — marketplaces delete subscriptions after repeated
 * delivery failures, so this must be able to RE-CREATE any subscription
 * it expects. Absence is not intent; never read a missing subscription as
 * "the user turned it off".
 */
export async function reconcileChannelWebhookSubscriptions(
  args: ChannelTokenArgs
): Promise<void> {
  const endpoint = getWebhookEndpoint(args.marketplaceId);
  let sellerTopics: string[] = [];

  try {
    const credentials = getAppCredentials(args.marketplaceId);
    const appClient = resolveAppClient(args.marketplaceId, credentials);
    sellerTopics = appClient?.getSellerTopics() ?? [];

    const apiClient = buildApiClient(args);
    if (!apiClient.reconcileSubscriptions) {
      return;
    }

    // The delivery target is app-scoped — one registration shared by every
    // channel — so it's registered with the application token, then the
    // seller-scoped subscriptions are pointed at the id it returns.
    const destinationId = await appClient?.reconcileDestination?.({
      endpoint,
      name: EBAY_DESTINATION_NAME,
      verificationToken: env.EBAY_WEBHOOK_VERIFICATION_TOKEN,
    });

    const { problems } = await reconcileChannelSubscriptions(
      getApiSyncContext(),
      {
        apiClient,
        channelId: args.channelId,
        endpoint,
        destinationId,
      }
    );
    if (problems.length > 0) {
      console.warn(
        `${args.marketplaceId} webhook subscriptions: ${problems.length} topics failed for channel ${args.channelId}`
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(
      `${args.marketplaceId} webhook subscription setup failed:`,
      message
    );
    for (const topic of sellerTopics) {
      await getApiSyncContext()
        .db.insert(channelWebhookSubscription)
        .values({
          channelId: args.channelId,
          topic,
          subscriptionId: "",
          status: "error",
          error: message,
        })
        .onConflictDoUpdate({
          target: [
            channelWebhookSubscription.channelId,
            channelWebhookSubscription.topic,
          ],
          set: { status: "error", error: message, updatedAt: new Date() },
        })
        .catch(() => undefined);
    }
  }
}

/**
 * Teardown for disconnect/delete flows. Runs BEFORE the channel's tokens
 * are deleted — the remote cancellation authenticates with them, and the
 * marketplace keeps delivering otherwise. Best-effort: an uninstalled app
 * has dead tokens and the remote side is already gone.
 */
export async function removeChannelWebhookSubscriptions(
  args: ChannelTokenArgs
): Promise<void> {
  try {
    const apiClient = buildApiClient(args);
    await apiClient.removeAllSubscriptions?.();
  } catch (error) {
    console.warn(
      `${args.marketplaceId} webhook subscription removal failed (continuing):`,
      error instanceof Error ? error.message : error
    );
  }
  await getApiSyncContext()
    .db.delete(channelWebhookSubscription)
    .where(eq(channelWebhookSubscription.channelId, args.channelId));
}
