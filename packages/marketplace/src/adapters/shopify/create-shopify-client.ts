import { createAdminApiClient } from "@shopify/admin-api-client";

export const SHOPIFY_API_VERSION = "2026-07";

/**
 * Returns a Shopify auth-flow client: a typed bundle of the credentials
 * needed to generate the authorization URL and exchange the OAuth code for
 * tokens. Mirrors the eBay pattern (`createEbayAuthClient`), which returns a
 * configured `eBayApi` SDK instance with scopes preset.
 *
 * Shopify ships no OAuth SDK — the auth flow is hand-rolled in `auth/*` —
 * so this factory's return is a config bundle rather than a stateful SDK
 * instance. Scopes are pinned in `auth/scopes.ts` and consumed inside
 * `generate-auth-url.ts`, so they don't appear here.
 */
export function createShopifyAuthClient(
  shopUrl: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
) {
  return { shopUrl, clientId, clientSecret, redirectUri };
}

export type ShopifyAuthSDKClient = ReturnType<typeof createShopifyAuthClient>;

/**
 * Shopify Admin GraphQL API client wrapping `@shopify/admin-api-client`.
 *
 * `shopUrl` is the merchant's storefront URL in canonical form
 * (`https://{shop}.myshopify.com`); the SDK extracts the host internally.
 * `accessToken` is a Shopify offline access token (no expiry, no refresh).
 * `apiVersion` is pinned in code because changing Shopify API versions is a
 * code-compatibility change, not deployment configuration.
 */
export function createShopifyApiClient(shopUrl: string, accessToken: string) {
  return createAdminApiClient({
    storeDomain: shopUrl,
    accessToken,
    apiVersion: SHOPIFY_API_VERSION,
  });
}

export type ShopifyAdminClient = ReturnType<typeof createShopifyApiClient>;
