import type { AuthToken } from "ebay-api/lib/auth/oAuth2.js";
import type { CurrentToken, TokenResponse } from "../../../types";
import { getApiErrorStatus } from "../../../utils/api-error";
import { createEbayApiClient } from "../create-ebay-client";

/**
 * Refresh an expired eBay access token using the refresh token
 */
export async function refreshAccessToken(
  clientId: string,
  clientSecret: string,
  currentToken: CurrentToken
): Promise<TokenResponse> {
  const apiClient = createEbayApiClient(
    clientId,
    clientSecret,
    currentToken.accessToken,
    currentToken.refreshToken
  );

  try {
    const authToken: AuthToken = {
      access_token: currentToken.accessToken,
      refresh_token: currentToken.refreshToken,
      expires_in: currentToken.accessTokenExpiresAt
        ? Math.floor(
            (currentToken.accessTokenExpiresAt.getTime() - Date.now()) / 1000
          )
        : undefined,
      refresh_token_expires_in: currentToken.refreshTokenExpiresAt
        ? Math.floor(
            (currentToken.refreshTokenExpiresAt.getTime() - Date.now()) / 1000
          )
        : undefined,
    };

    apiClient.OAuth2.setCredentials(authToken);

    const token = await apiClient.OAuth2.refreshUserAccessToken();

    if (!(token.access_token && token.refresh_token)) {
      throw new Error("Invalid refresh token response from eBay");
    }

    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresIn: token.expires_in || 7200,
      refreshTokenExpiresIn: token.refresh_token_expires_in || 47_304_000,
      tokenType: token.token_type || "Bearer",
    };
  } catch (error) {
    // Carry the HTTP status onto the wrapper. `OAuth2.refreshUserAccessToken`
    // rejects with the raw Axios error (it does NOT go through the SDK's
    // eBay-error normalization), so dropping it here would hide the
    // `invalid_grant` 400 that tells callers the grant is permanently dead
    // — TokenManager would retry a revoked grant forever.
    const status = getApiErrorStatus(error);
    throw Object.assign(
      new Error(
        `Failed to refresh eBay access token: ${error instanceof Error ? error.message : "Unknown error"}`,
        { cause: error }
      ),
      status === undefined ? {} : { statusCode: status }
    );
  }
}
