import type { AuthConfig, TokenResponse } from "../../../types";
import type { AuthClient } from "../../base";
import { exchangeShopifyCodeForTokens } from "./exchange-code-for-tokens";
import { generateShopifyAuthUrl } from "./generate-auth-url";

/**
 * Shopify auth-only adapter for the OAuth authorization code flow.
 *
 * Shopify scopes OAuth per-shop, so the constructor requires a `shopUrl` in
 * the {@link AuthConfig}. The OAuth route normalizes the merchant-supplied
 * shop input to canonical form (`https://{shop}.myshopify.com`) before
 * instantiating this client.
 */
export class ShopifyAuthClient implements AuthClient {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly shopUrl: string;

  constructor(config: AuthConfig) {
    if (!config.shopUrl) {
      throw new Error("ShopifyAuthClient requires a shopUrl");
    }
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.redirectUri = config.redirectUri;
    this.shopUrl = config.shopUrl;
  }

  generateAuthUrl(state?: string): string {
    return generateShopifyAuthUrl({
      shopUrl: this.shopUrl,
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      redirectUri: this.redirectUri,
      state: state ?? "",
    });
  }

  async exchangeCodeForTokens(code: string): Promise<TokenResponse> {
    return await exchangeShopifyCodeForTokens({
      shopUrl: this.shopUrl,
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      redirectUri: this.redirectUri,
      code,
    });
  }
}
