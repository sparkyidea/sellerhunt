import { env } from "@dashseller/env/server";
import { createApiClient, createAuthClient } from "@dashseller/marketplace";
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

const STATE_COOKIE = "ebay_oauth_state";

function getEbayConfig() {
  return {
    clientId: env.EBAY_CLIENT_ID,
    clientSecret: env.EBAY_CLIENT_SECRET,
    redirectUri: env.EBAY_RU_NAME,
  };
}

const ebayOAuth = new Hono();

ebayOAuth.get("/authorize", async (c) => {
  try {
    const session = await requireSession(c);
    if (!session) {
      return redirectChannels(c, { error: "unauthorized" });
    }

    const authClient = createAuthClient("ebay", getEbayConfig());
    const state = generateState();
    setStateCookie(c, STATE_COOKIE, state);

    return c.redirect(authClient.generateAuthUrl(state));
  } catch (error) {
    console.error("eBay OAuth initiation error:", error);
    return redirectChannels(c, { error: "oauth_failed" });
  }
});

ebayOAuth.get("/callback", async (c) => {
  try {
    const code = c.req.query("code");
    const state = c.req.query("state");
    const error = c.req.query("error");

    if (error) {
      console.error("eBay OAuth error:", error);
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

    const session = await requireSession(c);
    if (!session) {
      return redirectChannels(c, { error: "unauthorized" });
    }

    const config = getEbayConfig();
    const authClient = createAuthClient("ebay", config);
    const tokenResponse = await authClient.exchangeCodeForTokens(code);

    const apiClient = createApiClient("ebay", {
      ...config,
      accessToken: tokenResponse.accessToken,
      refreshToken: tokenResponse.refreshToken,
    });

    const channelInfo = await apiClient.getChannel().catch((err) => {
      console.error("Failed to fetch eBay user info:", err);
      return null;
    });
    if (!channelInfo) {
      return redirectChannels(c, { error: getErrorCode("user_info_failed") });
    }

    const result = await persistOAuthChannel({
      session,
      marketplaceId: "ebay",
      channelInfo,
      tokenResponse,
    });
    if (!result.ok) {
      return redirectChannels(c, { error: getErrorCode(result.errorCode) });
    }

    await completeChannelConnection({
      channelId: result.channelId,
      marketplaceId: "ebay",
      tokenResponse,
    });

    return redirectChannels(c, { success: "ebay" });
  } catch (error) {
    console.error("eBay OAuth callback error:", error);
    return redirectChannels(c, { error: "oauth_failed" });
  }
});

export default ebayOAuth;
