import type { TokenResponse } from "../../../types";
import { createShopifyAuthClient } from "../create-shopify-client";

const TRAILING_SLASH_RE = /\/+$/;

interface ShopifyTokenResponseBody {
  access_token: string;
  scope: string;
  // Online tokens additionally return `expires_in`, `associated_user`, etc.
  // We only support offline access, so those fields are ignored.
}

/**
 * Exchange the OAuth `code` returned from Shopify's consent screen for an
 * offline access token.
 *
 * Spec: https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant#step-3-get-an-access-token
 *
 * Endpoint: `POST {shopUrl}/admin/oauth/access_token` with JSON body
 * `{ client_id, client_secret, code }`.
 *
 * Offline access tokens never expire and have no refresh token, so the
 * returned {@link TokenResponse} has `expiresIn`, `refreshToken`, and
 * `refreshTokenExpiresIn` all set to `null`. The OAuth callback substitutes
 * sentinel values when persisting to the NOT NULL DB columns.
 */
export async function exchangeShopifyCodeForTokens(args: {
  shopUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
}): Promise<TokenResponse> {
  const client = createShopifyAuthClient(
    args.shopUrl,
    args.clientId,
    args.clientSecret,
    args.redirectUri
  );
  const url = `${client.shopUrl.replace(TRAILING_SLASH_RE, "")}/admin/oauth/access_token`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: client.clientId,
      client_secret: client.clientSecret,
      code: args.code,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Shopify token exchange failed (${response.status}): ${errorText}`
    );
  }

  const body = (await response.json()) as ShopifyTokenResponseBody;

  return {
    accessToken: body.access_token,
    expiresIn: null,
    refreshToken: null,
    refreshTokenExpiresIn: null,
    tokenType: "Bearer",
  };
}
