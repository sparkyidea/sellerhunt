import { createEbayAuthClient } from "../create-ebay-client";

/**
 * Generate eBay OAuth authorization URL with optional state parameter
 * @param state - Optional CSRF protection state (should be set and stored in cookies by caller)
 */
export function generateAuthUrl(
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  state?: string
): string {
  const authClient = createEbayAuthClient(clientId, clientSecret, redirectUri);

  const authUrl = authClient.OAuth2.generateAuthUrl(
    redirectUri,
    authClient.OAuth2.getScope(),
    state
  );

  if (!authUrl) {
    throw new Error("Failed to generate eBay authorization URL");
  }

  return authUrl;
}
