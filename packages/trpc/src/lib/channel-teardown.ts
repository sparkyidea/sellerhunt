import { db } from "@dashseller/db";
import {
  channelToken,
  channelWebhookSubscription,
} from "@dashseller/db/schema";
import { env } from "@dashseller/env/server";
import { createApiClient } from "@dashseller/marketplace";
import type { MarketplaceType } from "@dashseller/marketplace/types";
import { decryptSecret } from "@dashseller/marketplace/utils/decrypt-secret";
import { eq } from "drizzle-orm";

function getCredentials(marketplaceId: MarketplaceType): {
  clientId: string;
  clientSecret: string;
} {
  switch (marketplaceId) {
    case "ebay":
      return {
        clientId: env.EBAY_CLIENT_ID,
        clientSecret: env.EBAY_CLIENT_SECRET,
      };
    case "shopify":
      return {
        clientId: env.SHOPIFY_CLIENT_ID,
        clientSecret: env.SHOPIFY_CLIENT_SECRET,
      };
    default:
      throw new Error(`No credentials for marketplace: ${marketplaceId}`);
  }
}

/**
 * Remote + local webhook subscription teardown for a channel that is being
 * deleted. MUST run before the channel's tokens are deleted — the remote
 * cancellation authenticates with them, and the marketplace keeps
 * delivering otherwise. Best-effort on the remote side (an uninstalled app
 * has dead tokens and nothing left to cancel); the local rows always go.
 */
export async function teardownChannelWebhooks(args: {
  channelId: string;
  marketplaceId: string;
  shopUrl?: string | null;
}): Promise<void> {
  try {
    const [token] = await db
      .select({
        accessToken: channelToken.accessToken,
        refreshToken: channelToken.refreshToken,
      })
      .from(channelToken)
      .where(eq(channelToken.channelId, args.channelId))
      .limit(1);
    if (token) {
      const marketplaceId = args.marketplaceId as MarketplaceType;
      const credentials = getCredentials(marketplaceId);
      const apiClient = createApiClient(marketplaceId, {
        ...credentials,
        accessToken: await decryptSecret(
          token.accessToken,
          env.ENCRYPTION_SECRET
        ),
        refreshToken: await decryptSecret(
          token.refreshToken,
          env.ENCRYPTION_SECRET
        ),
        shopUrl: args.shopUrl ?? undefined,
      });
      await apiClient.removeAllSubscriptions?.();
    }
  } catch (error) {
    console.warn(
      `${args.marketplaceId} webhook teardown failed (continuing):`,
      error instanceof Error ? error.message : error
    );
  }
  await db
    .delete(channelWebhookSubscription)
    .where(eq(channelWebhookSubscription.channelId, args.channelId));
}
