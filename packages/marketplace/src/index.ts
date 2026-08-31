import type { ApiClient, AppClient, AuthClient } from "./adapters/base";
import { EbayApiClient } from "./adapters/ebay/api/client";
import { EbayAppClient } from "./adapters/ebay/app/client";
import { EbayAuthClient } from "./adapters/ebay/auth/client";
import { ShopifyApiClient } from "./adapters/shopify/api/client";
import { ShopifyAppClient } from "./adapters/shopify/app/client";
import { ShopifyAuthClient } from "./adapters/shopify/auth/client";
import type {
  ApiConfig,
  AppConfig,
  AuthConfig,
  MarketplaceType,
} from "./types";

/**
 * Create an auth-only marketplace client for OAuth authorization flow.
 * Caller provides all credentials — no environment variables are read.
 * Types live at `@dashseller/marketplace/types`.
 * Token + encryption utils live at `@dashseller/marketplace/utils`.
 *
 * @example
 * ```typescript
 * const authClient = createAuthClient("ebay", {
 *   clientId: env.EBAY_CLIENT_ID,
 *   clientSecret: env.EBAY_CLIENT_SECRET,
 *   redirectUri: env.EBAY_RU_NAME,
 * });
 * const authUrl = authClient.generateAuthUrl(state);
 * const tokens = await authClient.exchangeCodeForTokens(code);
 * ```
 */
export function createAuthClient(
  marketplace: MarketplaceType | string,
  config: AuthConfig
): AuthClient {
  const marketplaceId = marketplace.toLowerCase() as MarketplaceType;

  switch (marketplaceId) {
    case "ebay":
      return new EbayAuthClient(config);
    case "shopify":
      return new ShopifyAuthClient(config);
    default:
      throw new Error(`Unsupported marketplace: ${marketplaceId}`);
  }
}

/**
 * Create an API-ready marketplace client for authenticated operations.
 * Caller provides all credentials — no environment variables are read.
 *
 * @example
 * ```typescript
 * const apiClient = createApiClient("ebay", {
 *   clientId: env.EBAY_CLIENT_ID,
 *   clientSecret: env.EBAY_CLIENT_SECRET,
 *   accessToken: tokens.accessToken,
 *   refreshToken: tokens.refreshToken,
 * });
 * const channel = await apiClient.getChannel();
 * ```
 */
export function createApiClient(
  marketplace: MarketplaceType | string,
  config: ApiConfig
): ApiClient {
  const marketplaceId = marketplace.toLowerCase() as MarketplaceType;

  switch (marketplaceId) {
    case "ebay":
      return new EbayApiClient(config);
    case "shopify":
      return new ShopifyApiClient(config);
    default:
      throw new Error(`Unsupported marketplace: ${marketplaceId}`);
  }
}

/**
 * Create an application-token client for app-scoped operations.
 * Caller provides all credentials — no environment variables are read.
 *
 * Only marketplaces with app-scoped notification infrastructure have one;
 * others throw, same as the factories above. Callers reach this per marketplace,
 * not per channel — there is no seller context involved.
 *
 * @example
 * ```typescript
 * const appClient = createAppClient("ebay", {
 *   clientId: env.EBAY_CLIENT_ID,
 *   clientSecret: env.EBAY_CLIENT_SECRET,
 * });
 * const destinationId = await appClient.reconcileDestination({
 *   name: "dashseller-webhooks",
 *   endpoint: "https://api.example.com/webhook/ebay",
 *   verificationToken: env.EBAY_WEBHOOK_VERIFICATION_TOKEN,
 * });
 * ```
 */
export function createAppClient(
  marketplace: MarketplaceType | string,
  config: AppConfig
): AppClient {
  const marketplaceId = marketplace.toLowerCase() as MarketplaceType;

  switch (marketplaceId) {
    case "ebay":
      return new EbayAppClient(config);
    case "shopify":
      return new ShopifyAppClient(config);
    default:
      throw new Error(`Unsupported marketplace: ${marketplaceId}`);
  }
}
