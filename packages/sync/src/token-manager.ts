import type { SelectChannel, SelectChannelToken } from "@dashseller/db/schema";
import { channel, channelToken } from "@dashseller/db/schema";
import { createApiClient } from "@dashseller/marketplace";
import type {
  ApiClient,
  MarketplaceType,
  TokenResponse,
} from "@dashseller/marketplace/types";
import {
  getApiErrorStatus,
  isTokenExpired,
} from "@dashseller/marketplace/utils";
import { decryptSecret } from "@dashseller/marketplace/utils/decrypt-secret";
import { encryptSecret } from "@dashseller/marketplace/utils/encrypt-secret";
import { eq, sql } from "drizzle-orm";
import type { SyncContext } from "./context";
import { recordDomainRun } from "./orders/watermark";

const REFRESH_BUFFER_MINUTES = 10;
/** Waiting on another worker's refresh; their HTTP budget bounds ours. */
const LOCK_TIMEOUT = "45s";
/** DB statements inside the refresh transaction. */
const STATEMENT_TIMEOUT = "15s";
/**
 * Safety net above the HTTP timeout: the token-endpoint await is
 * idle-in-transaction time, so this must exceed it or Postgres kills the
 * transaction mid-refresh.
 */
const IDLE_IN_TX_TIMEOUT = "60s";
const HTTP_TIMEOUT_MS = 30_000;

/** Refresh failed in a way only the seller re-consenting can fix. */
export class TokenAuthError extends Error {
  constructor(channelId: string, cause: unknown) {
    super(`Marketplace rejected the refresh grant for channel ${channelId}`);
    this.name = "TokenAuthError";
    this.cause = cause;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(new Error(`Token refresh HTTP call timed out after ${ms}ms`)),
      ms
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/**
 * The token endpoint answering 400/401 means the grant itself is dead
 * (revoked consent, expired refresh token) — retrying can never succeed.
 * Anything else (5xx, network, timeout) is transient and must surface.
 */
function isAuthPermanentError(error: unknown): boolean {
  const status = getApiErrorStatus(error);
  return status === 400 || status === 401;
}

export type ApiClientFactory = typeof createApiClient;

type DbTransaction = Parameters<
  Parameters<SyncContext["db"]["transaction"]>[0]
>[0];

/**
 * Manages token refresh and validation for marketplace API calls.
 *
 * Refresh is safe under concurrency: the actual refresh runs inside a
 * transaction holding `pg_advisory_xact_lock(hashtextextended(...))` on the
 * channel id, and re-reads the token row after acquiring the lock — the
 * loser of a race finds a fresh token and skips its own HTTP call. This
 * matters beyond wasted calls: eBay rotates refresh-token state, so two
 * interleaved refreshes can invalidate each other's grant.
 */
export class TokenManager {
  private readonly apiClientFactory: ApiClientFactory;
  private readonly channelDetails: SelectChannel;
  private readonly ctx: SyncContext;
  private tokenData: SelectChannelToken;

  constructor(
    ctx: SyncContext,
    channelDetails: SelectChannel,
    tokenData: SelectChannelToken,
    apiClientFactory: ApiClientFactory = createApiClient
  ) {
    this.ctx = ctx;
    this.channelDetails = channelDetails;
    this.tokenData = tokenData;
    this.apiClientFactory = apiClientFactory;
  }

  /**
   * Get a valid access token, refreshing if necessary
   */
  async getValidAccessToken(): Promise<string> {
    if (
      isTokenExpired(
        this.tokenData.accessTokenExpiresAt,
        REFRESH_BUFFER_MINUTES
      )
    ) {
      return await this.refreshToken();
    }
    return await decryptSecret(
      this.tokenData.accessToken,
      this.ctx.credentials.encryptionSecret
    );
  }

  /**
   * Refresh stored tokens when they are near expiry.
   */
  async refreshIfNeeded(bufferMinutes = REFRESH_BUFFER_MINUTES): Promise<{
    refreshed: boolean;
    tokenData: SelectChannelToken;
  }> {
    if (!isTokenExpired(this.tokenData.accessTokenExpiresAt, bufferMinutes)) {
      return { refreshed: false, tokenData: this.tokenData };
    }
    await this.refreshToken();
    return { refreshed: true, tokenData: this.tokenData };
  }

  /**
   * Create an API client with valid tokens.
   * Automatically refreshes tokens if expired.
   */
  async createApiClient(): Promise<ApiClient> {
    const accessToken = await this.getValidAccessToken();
    const refreshToken = await decryptSecret(
      this.tokenData.refreshToken,
      this.ctx.credentials.encryptionSecret
    );
    return this.instantiateApiClient(accessToken, refreshToken);
  }

  /**
   * Force-refresh tokens, then create an API client with the persisted result.
   * Use this after upstream auth failures where expiry metadata may be stale —
   * the refresh runs even when the stored expiry claims the token is fresh,
   * because the marketplace just proved otherwise.
   */
  async forceRefreshAndCreateApiClient(): Promise<ApiClient> {
    const accessToken = await this.refreshToken({ force: true });
    const refreshToken = await decryptSecret(
      this.tokenData.refreshToken,
      this.ctx.credentials.encryptionSecret
    );
    return this.instantiateApiClient(accessToken, refreshToken);
  }

  private instantiateApiClient(
    accessToken: string,
    refreshToken: string
  ): ApiClient {
    const marketplaceId = this.channelDetails.marketplaceId as MarketplaceType;
    const { clientId, clientSecret, shopUrl } =
      this.ctx.credentials.getMarketplaceCredentials(marketplaceId, {
        shopUrl: this.channelDetails.reference,
      });
    return this.apiClientFactory(marketplaceId, {
      clientId,
      clientSecret,
      accessToken,
      refreshToken,
      accessTokenExpiresAt: this.tokenData.accessTokenExpiresAt,
      refreshTokenExpiresAt: this.tokenData.refreshTokenExpiresAt,
      shopUrl,
    });
  }

  /**
   * Serialized refresh. Inside one transaction: take the per-channel
   * advisory lock, re-read the token row (the winner of a race has already
   * persisted a fresh token — use it and skip the HTTP call), otherwise
   * call the token endpoint under a timeout and persist the result before
   * releasing the lock.
   *
   * `force` handles the marketplace rejecting a token the stored expiry
   * still claims is fresh (early revocation, stale metadata): the
   * expiry-based short-circuit is skipped, and only a token some OTHER
   * worker persisted while we waited on the lock counts as already
   * refreshed.
   */
  private async refreshToken(
    options: { force?: boolean } = {}
  ): Promise<string> {
    const { encryptionSecret } = this.ctx.credentials;
    try {
      const result = await this.ctx.db.transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`));
        await tx.execute(
          sql.raw(`SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT}'`)
        );
        await tx.execute(
          sql.raw(
            `SET LOCAL idle_in_transaction_session_timeout = '${IDLE_IN_TX_TIMEOUT}'`
          )
        );
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${`channel-token:${this.channelDetails.id}`}, 0))`
        );

        const [current] = await tx
          .select()
          .from(channelToken)
          .where(eq(channelToken.channelId, this.channelDetails.id))
          .limit(1);
        if (!current) {
          throw new Error(
            `No token found for channel: ${this.channelDetails.id}`
          );
        }

        const refreshedByPeer =
          current.updatedAt.getTime() !== this.tokenData.updatedAt.getTime();
        const reusable = options.force
          ? refreshedByPeer
          : !isTokenExpired(
              current.accessTokenExpiresAt,
              REFRESH_BUFFER_MINUTES
            );
        if (reusable) {
          this.ctx.logger.info("Token already refreshed by concurrent worker", {
            channelId: this.channelDetails.id,
          });
          return {
            tokenData: current,
            accessToken: await decryptSecret(
              current.accessToken,
              encryptionSecret
            ),
          };
        }

        const accessToken = await decryptSecret(
          current.accessToken,
          encryptionSecret
        );
        const refreshToken = await decryptSecret(
          current.refreshToken,
          encryptionSecret
        );
        const apiClient = this.instantiateApiClientFrom(
          current,
          accessToken,
          refreshToken
        );

        const newTokens = await withTimeout(
          apiClient.refresh(),
          HTTP_TIMEOUT_MS
        );
        const persisted = await this.persistTokenResponse(
          tx,
          current,
          newTokens,
          encryptionSecret
        );

        this.ctx.logger.info("Successfully refreshed access token", {
          channelId: this.channelDetails.id,
        });
        return { tokenData: persisted, accessToken: newTokens.accessToken };
      });

      this.tokenData = result.tokenData;
      return result.accessToken;
    } catch (error) {
      if (isAuthPermanentError(error)) {
        await this.disconnectChannel(error);
        throw new TokenAuthError(this.channelDetails.id, error);
      }
      throw error;
    }
  }

  private instantiateApiClientFrom(
    tokenRow: SelectChannelToken,
    accessToken: string,
    refreshToken: string
  ): ApiClient {
    const marketplaceId = this.channelDetails.marketplaceId as MarketplaceType;
    const { clientId, clientSecret, shopUrl } =
      this.ctx.credentials.getMarketplaceCredentials(marketplaceId, {
        shopUrl: this.channelDetails.reference,
      });
    return this.apiClientFactory(marketplaceId, {
      clientId,
      clientSecret,
      accessToken,
      refreshToken,
      accessTokenExpiresAt: tokenRow.accessTokenExpiresAt,
      refreshTokenExpiresAt: tokenRow.refreshTokenExpiresAt,
      shopUrl,
    });
  }

  /**
   * A dead grant means the seller must re-consent — flag the channel so
   * schedulers stop picking it up and the UI can prompt a reconnect.
   * Deliberately outside the refresh transaction: it must survive the
   * rollback of the failed refresh.
   */
  private async disconnectChannel(cause: unknown): Promise<void> {
    this.ctx.logger.error("Refresh grant rejected — disconnecting channel", {
      channelId: this.channelDetails.id,
      cause: cause instanceof Error ? cause.message : String(cause),
    });
    await this.ctx.db
      .update(channel)
      .set({ connected: false })
      .where(eq(channel.id, this.channelDetails.id));
    await recordDomainRun(this.ctx, {
      channelId: this.channelDetails.id,
      domain: "channels",
      error: "Marketplace authorization expired — reconnect required",
      organizationId: this.channelDetails.organizationId,
      ranAt: this.ctx.clock.now(),
      success: false,
    });
  }

  private async persistTokenResponse(
    tx: DbTransaction,
    current: SelectChannelToken,
    newTokens: TokenResponse,
    encryptionKey: string
  ): Promise<SelectChannelToken> {
    // When the marketplace doesn't issue a fresh expiry (Shopify offline
    // access — null), keep the existing DB sentinel.
    const now = this.ctx.clock.now();
    const accessTokenExpiresAt =
      newTokens.expiresIn == null
        ? current.accessTokenExpiresAt
        : new Date(now.getTime() + newTokens.expiresIn * 1000);
    const refreshTokenExpiresAt =
      newTokens.refreshTokenExpiresIn == null
        ? current.refreshTokenExpiresAt
        : new Date(now.getTime() + newTokens.refreshTokenExpiresIn * 1000);
    const accessToken = await encryptSecret(
      newTokens.accessToken,
      encryptionKey
    );
    const refreshToken =
      newTokens.refreshToken == null
        ? current.refreshToken
        : await encryptSecret(newTokens.refreshToken, encryptionKey);
    const updatedAt = now;

    await tx
      .update(channelToken)
      .set({
        accessToken,
        refreshToken,
        accessTokenExpiresAt,
        refreshTokenExpiresAt,
        updatedAt,
      })
      .where(eq(channelToken.id, current.id));

    return {
      ...current,
      accessToken,
      refreshToken,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
      updatedAt,
    };
  }

  /**
   * Load channel details and token data from database
   */
  static async loadForChannel(
    ctx: SyncContext,
    channelId: string
  ): Promise<{
    channelDetails: SelectChannel;
    tokenData: SelectChannelToken;
  }> {
    const [channelData] = await ctx.db
      .select()
      .from(channel)
      .where(eq(channel.id, channelId))
      .limit(1);

    if (!channelData) {
      throw new Error(`Channel not found: ${channelId}`);
    }

    const [token] = await ctx.db
      .select()
      .from(channelToken)
      .where(eq(channelToken.channelId, channelId))
      .limit(1);

    if (!token) {
      throw new Error(`No token found for channel: ${channelId}`);
    }

    return {
      channelDetails: channelData,
      tokenData: token,
    };
  }
}
