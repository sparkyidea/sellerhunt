import type { ApiClient } from "@dashseller/marketplace/types";
import { getApiErrorStatus } from "@dashseller/marketplace/utils";
import type { SyncContext } from "@dashseller/sync";
import { TokenManager } from "@dashseller/sync";
import { RateLimitedError } from "../registry";

const DEFAULT_RATE_LIMIT_DELAY_MS = 30_000;

/**
 * Translate a marketplace 429 into the registry's RateLimitedError so the
 * base processor delays the job instead of burning a retry attempt.
 * Everything else re-throws untouched.
 */
export function throwIfRateLimited(error: unknown): never {
  if (getApiErrorStatus(error) === 429) {
    const retryAfterHeader = (error as { headers?: { "retry-after"?: string } })
      .headers?.["retry-after"];
    const retryAfterMs = retryAfterHeader
      ? Number.parseInt(retryAfterHeader, 10) * 1000
      : DEFAULT_RATE_LIMIT_DELAY_MS;
    throw new RateLimitedError(
      Number.isNaN(retryAfterMs) ? DEFAULT_RATE_LIMIT_DELAY_MS : retryAfterMs
    );
  }
  throw error;
}

/**
 * Marketplace client resolution for one channel. The default builds it
 * from the channel's stored tokens; tests inject a stub factory.
 */
export type ChannelApiClientFactory = (
  ctx: SyncContext,
  channelId: string
) => Promise<ApiClient>;

export const defaultApiClientFactory: ChannelApiClientFactory = async (
  ctx,
  channelId
) => {
  const { channelDetails, tokenData } = await TokenManager.loadForChannel(
    ctx,
    channelId
  );
  const manager = new TokenManager(ctx, channelDetails, tokenData);
  return await manager.createApiClient();
};
