import type { TokenResponse } from "../../../types";
import { createEbayAuthClient } from "../create-ebay-client";

/**
 * Exchange authorization code for access and refresh tokens
 */
export async function exchangeCodeForTokens(
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  code: string
): Promise<TokenResponse> {
  const authClient = createEbayAuthClient(clientId, clientSecret, redirectUri);

  try {
    const token = await authClient.OAuth2.getToken(code);

    if (!(token.access_token && token.refresh_token)) {
      throw new Error("Invalid token response from eBay");
    }

    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresIn: token.expires_in || 7200,
      refreshTokenExpiresIn: token.refresh_token_expires_in || 47_304_000,
      tokenType: token.token_type || "Bearer",
    };
  } catch (error) {
    throw new Error(
      `Failed to exchange eBay authorization code: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}
