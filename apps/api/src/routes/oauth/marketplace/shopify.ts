import { env } from "@dashseller/env/server";
import { createApiClient, createAuthClient } from "@dashseller/marketplace";
import { verifyShopifyHmac } from "@dashseller/marketplace/shopify/verify-hmac";
import { generateState } from "@dashseller/marketplace/utils";
import { Hono } from "hono";
import { deleteCookie, getCookie } from "hono/cookie";
import {
  completeChannelConnection,
  getErrorCode,
  persistOAuthChannel,
  redirectChannels,
  requireSession,
  setStateCookie,
} from "./_shared";

const STATE_COOKIE = "shopify_oauth_state";
const SHOP_URL_COOKIE = "shopify_oauth_shop_url";

const SHOPIFY_SHOP_HOST_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;
const URL_PROTOCOL_RE = /^https?:\/\//;
const TRAILING_SLASH_RE = /\/+$/;

/**
 * Shopify OAuth requires the storefront URL up front. Accept either a bare
 * domain (`mystore.myshopify.com`) or a full URL; validate the host matches
 * Shopify's reserved subdomain space; return the canonical full URL.
 */
function normalizeShopUrl(rawShop: string | undefined): string | null {
  if (!rawShop) {
    return null;
  }
  const host = rawShop
    .trim()
    .toLowerCase()
    .replace(URL_PROTOCOL_RE, "")
    .replace(TRAILING_SLASH_RE, "");
  if (!SHOPIFY_SHOP_HOST_RE.test(host)) {
    return null;
  }
  return `https://${host}`;
}

function getShopifyConfig() {
  return {
    clientId: env.SHOPIFY_CLIENT_ID,
    clientSecret: env.SHOPIFY_CLIENT_SECRET,
    redirectUri: `${env.API_URL}/oauth/shopify/callback`,
  };
}

const shopifyOAuth = new Hono();

shopifyOAuth.get("/authorize", async (c) => {
  try {
    const session = await requireSession(c);
    if (!session) {
      return redirectChannels(c, { error: "unauthorized" });
    }

    const shopUrl = normalizeShopUrl(c.req.query("shop"));
    if (!shopUrl) {
      return redirectChannels(c, { error: getErrorCode("missing_shop") });
    }

    const authClient = createAuthClient("shopify", {
      ...getShopifyConfig(),
      shopUrl,
    });

    const state = generateState();
    setStateCookie(c, STATE_COOKIE, state);
    setStateCookie(c, SHOP_URL_COOKIE, shopUrl);

    return c.redirect(authClient.generateAuthUrl(state));
  } catch (error) {
    console.error("Shopify OAuth initiation error:", error);
    return redirectChannels(c, { error: "oauth_failed" });
  }
});

shopifyOAuth.get("/callback", async (c) => {
  try {
    const code = c.req.query("code");
    const state = c.req.query("state");
    const error = c.req.query("error");

    if (error) {
      console.error("Shopify OAuth error:", error);
      return redirectChannels(c, { error });
    }
    if (!(code && state)) {
      return redirectChannels(c, {
        error: getErrorCode("missing_parameters"),
      });
    }

    const cookieState = getCookie(c, STATE_COOKIE);
    if (!cookieState || cookieState !== state) {
      console.error("State mismatch — potential CSRF attack");
      return redirectChannels(c, { error: getErrorCode("csrf_error") });
    }
    deleteCookie(c, STATE_COOKIE);

    const shopUrl = getCookie(c, SHOP_URL_COOKIE);
    deleteCookie(c, SHOP_URL_COOKIE);
    if (!shopUrl) {
      return redirectChannels(c, { error: getErrorCode("missing_shop") });
    }

    const session = await requireSession(c);
    if (!session) {
      return redirectChannels(c, { error: "unauthorized" });
    }

    const config = { ...getShopifyConfig(), shopUrl };

    // Verify Shopify HMAC signature on the callback. Required by Shopify spec
    // and protects against forged callbacks even when state validation passes.
    const queryParams: Record<string, string | undefined> = {};
    for (const [key, value] of new URL(c.req.url).searchParams.entries()) {
      queryParams[key] = value;
    }
    if (!verifyShopifyHmac(queryParams, config.clientSecret)) {
      console.error("Shopify HMAC verification failed");
      return redirectChannels(c, { error: getErrorCode("hmac_error") });
    }

    const authClient = createAuthClient("shopify", config);
    const tokenResponse = await authClient.exchangeCodeForTokens(code);

    const apiClient = createApiClient("shopify", {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      shopUrl: config.shopUrl,
      accessToken: tokenResponse.accessToken,
      refreshToken: tokenResponse.refreshToken,
    });

    const channelInfo = await apiClient.getChannel().catch((err) => {
      console.error("Failed to fetch Shopify shop info:", err);
      return null;
    });
    if (!channelInfo) {
      return redirectChannels(c, { error: getErrorCode("user_info_failed") });
    }

    const result = await persistOAuthChannel({
      session,
      marketplaceId: "shopify",
      channelInfo,
      tokenResponse,
    });
    if (!result.ok) {
      return redirectChannels(c, { error: getErrorCode(result.errorCode) });
    }

    await completeChannelConnection({
      channelId: result.channelId,
      marketplaceId: "shopify",
      shopUrl,
      tokenResponse,
    });

    return redirectChannels(c, { success: "shopify" });
  } catch (error) {
    console.error("Shopify OAuth callback error:", error);
    return redirectChannels(c, { error: "oauth_failed" });
  }
});

export default shopifyOAuth;
