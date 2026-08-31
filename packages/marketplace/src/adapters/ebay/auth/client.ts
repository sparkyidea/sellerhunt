import type { AuthConfig, TokenResponse } from "../../../types";
import type { AuthClient } from "../../base";
import { exchangeCodeForTokens } from "./exchange-code-for-tokens";
import { generateAuthUrl } from "./generate-auth-url";

/**
 * eBay auth-only adapter for OAuth authorization flow
 * Handles generating auth URLs and exchanging authorization codes for tokens
 */
export class EbayAuthClient implements AuthClient {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;

  constructor(config: AuthConfig) {
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.redirectUri = config.redirectUri;
  }

  /**
   * Generate eBay OAuth authorization URL with optional state parameter
   * @param state - Optional CSRF protection state (should be set and stored in cookies by caller)
   */
  generateAuthUrl(state?: string): string {
    return generateAuthUrl(
      this.clientId,
      this.clientSecret,
      this.redirectUri,
      state
    );
  }

  /**
   * Exchange authorization code for access and refresh tokens
   * @param code - Authorization code from OAuth callback
   */
  async exchangeCodeForTokens(code: string): Promise<TokenResponse> {
    return await exchangeCodeForTokens(
      this.clientId,
      this.clientSecret,
      this.redirectUri,
      code
    );
  }
}
