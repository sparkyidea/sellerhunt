import { env } from "@dashseller/env/server";
import type { AppConfig, MarketplaceType } from "@dashseller/marketplace/types";

/**
 * Developer-portal credential pair for app-scoped marketplace operations.
 *
 * Deliberately no `shopUrl`, unlike the trigger-sync twin
 * (`packages/trigger-sync/src/utils/get-marketplace-credentials.ts`): an
 * app-scoped operation authenticates as our application, so there is no seller
 * and no storefront to point at. Anything needing a shop URL is per-channel
 * work and belongs on a `createApiClient` path that reads it from
 * `channel.reference`.
 *
 * Throws rather than returning null: a marketplace we accept traffic for
 * without credentials configured is a deployment bug, not a request-time
 * condition to branch on.
 */
export function getAppCredentials(marketplaceId: MarketplaceType): AppConfig {
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
      throw new Error(
        `No app credentials configured for marketplace: ${marketplaceId}`
      );
  }
}
