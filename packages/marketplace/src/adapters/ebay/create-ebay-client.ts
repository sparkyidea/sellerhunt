import eBayApi from "ebay-api";
import { EBAY_OAUTH_SCOPES } from "./auth/scopes";

/**
 * Creates an eBay OAuth client for authorization flow
 * Used for generating authorization URLs and exchanging codes for tokens
 *
 * @param clientId - eBay OAuth client ID (App ID)
 * @param clientSecret - eBay OAuth client secret (Cert ID)
 * @param redirectUri - OAuth redirect URI (RuName)
 * @returns Configured eBay client for OAuth operations
 */
export function createEbayAuthClient(
  clientId: string,
  clientSecret: string,
  redirectUri: string
) {
  const clientConfig = {
    appId: clientId,
    certId: clientSecret,
    ruName: redirectUri,
    sandbox: false, // Always use production
    siteId: eBayApi.SiteId.EBAY_US,
    marketplaceId: eBayApi.MarketplaceId.EBAY_US,
    acceptLanguage: eBayApi.Locale.en_US,
    contentLanguage: eBayApi.Locale.en_US,
  };

  const client = new eBayApi(clientConfig);

  // Set OAuth scopes for authorization flow
  client.OAuth2.setScope(EBAY_OAUTH_SCOPES);

  return client;
}

/**
 * Client-credentials tokens only accept the base scope; requesting the full
 * user-consent scope list (EBAY_OAUTH_SCOPES) makes the mint call fail.
 */
const APP_TOKEN_SCOPE = ["https://api.ebay.com/oauth/api_scope"];

/**
 * Creates an eBay client that authenticates as the APPLICATION rather than a
 * seller: no user credentials are set, so the underlying SDK auto-mints and
 * caches a client-credentials token. Use for app-scoped operations —
 * notification destinations, notification public keys, and any other API
 * that takes an application token.
 *
 * @param clientId - eBay OAuth client ID (App ID)
 * @param clientSecret - eBay OAuth client secret (Cert ID)
 * @returns Configured eBay client for application-token operations
 */
export function createEbayAppClient(
  clientId: string,
  clientSecret: string
): eBayApi {
  const client = new eBayApi({
    appId: clientId,
    certId: clientSecret,
    sandbox: false,
    marketplaceId: eBayApi.MarketplaceId.EBAY_US,
  });
  client.OAuth2.setScope(APP_TOKEN_SCOPE);
  return client;
}

/**
 * Creates an eBay API client for authenticated operations
 * Used for making API calls (getListings, getChannel, etc.)
 *
 * @param clientId - eBay OAuth client ID (App ID)
 * @param clientSecret - eBay OAuth client secret (Cert ID)
 * @param accessToken - OAuth access token
 * @param refreshToken - OAuth refresh token
 * @returns Configured eBay client for API operations
 */
export function createEbayApiClient(
  clientId: string,
  clientSecret: string,
  accessToken: string,
  refreshToken: string
) {
  const clientConfig = {
    appId: clientId,
    certId: clientSecret,
    ruName: "", // Not needed for API operations
    sandbox: false, // Always use production
    siteId: eBayApi.SiteId.EBAY_US,
    marketplaceId: eBayApi.MarketplaceId.EBAY_US,
    acceptLanguage: eBayApi.Locale.en_US,
    contentLanguage: eBayApi.Locale.en_US,
  };

  const client = new eBayApi(clientConfig);

  // Set scopes so token refresh includes all required permissions
  client.OAuth2.setScope(EBAY_OAUTH_SCOPES);

  // Set credentials for authenticated API calls
  client.OAuth2.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  return client;
}
