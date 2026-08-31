import { createShopifyAuthClient } from "../create-shopify-client";
import { SHOPIFY_OAUTH_SCOPES } from "./scopes";

const TRAILING_SLASH_RE = /\/+$/;

/**
 * Build the Shopify OAuth authorization URL.
 *
 * Spec: https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant
 *
 * Form: `{shopUrl}/admin/oauth/authorize?client_id=...&scope=...&redirect_uri=...&state=...`
 *
 * Scopes are pinned in {@link SHOPIFY_OAUTH_SCOPES} — same pattern as eBay's
 * SDK-baked scopes. Callers don't pass them in.
 *
 * The merchant is redirected to this URL; on consent they land at the
 * configured `redirect_uri` (the dashseller OAuth callback) with `code`,
 * `shop`, `state`, `hmac`, and `host` query params.
 */
export function generateShopifyAuthUrl(args: {
  shopUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  state: string;
}): string {
  const client = createShopifyAuthClient(
    args.shopUrl,
    args.clientId,
    args.clientSecret,
    args.redirectUri
  );
  const params = new URLSearchParams({
    client_id: client.clientId,
    scope: SHOPIFY_OAUTH_SCOPES.join(","),
    redirect_uri: client.redirectUri,
    state: args.state,
  });
  // Offline access is the default — no `grant_options[]=per-user` param.
  return `${client.shopUrl.replace(TRAILING_SLASH_RE, "")}/admin/oauth/authorize?${params.toString()}`;
}
