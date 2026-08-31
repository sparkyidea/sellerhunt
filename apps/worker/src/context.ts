import { createDbClient } from "@dashseller/db/client";
import { env } from "@dashseller/env/worker";
import { createGeocoder } from "@dashseller/geo";
import type { MarketplaceType } from "@dashseller/marketplace/types";
import type { SyncContext, SyncLogger } from "@dashseller/sync";
import { systemClock } from "@dashseller/sync";

/** Structured JSON logs on stdout; the platform collects them. */
function createLogger(): SyncLogger {
  const emit = (
    level: string,
    message: string,
    meta?: Record<string, unknown>
  ) => {
    console.log(
      JSON.stringify({
        level,
        message,
        time: new Date().toISOString(),
        ...meta,
      })
    );
  };
  return {
    info: (message, meta) => emit("info", message, meta),
    warn: (message, meta) => emit("warn", message, meta),
    error: (message, meta) => emit("error", message, meta),
  };
}

export interface WorkerContext {
  close(): Promise<void>;
  ctx: SyncContext;
}

/**
 * The worker's SyncContext: env-validated credentials, its own db pool,
 * the shared geocoder, and the JSON logger. All process concerns live
 * here — domain code in @dashseller/sync stays env-free.
 */
export function createWorkerContext(): WorkerContext {
  const { db, close } = createDbClient(env.DATABASE_URL);
  const ctx: SyncContext = {
    db,
    clock: systemClock,
    logger: createLogger(),
    credentials: {
      encryptionSecret: env.ENCRYPTION_SECRET,
      getMarketplaceCredentials: (
        marketplaceId: MarketplaceType,
        options?: { shopUrl?: string | null }
      ) => {
        switch (marketplaceId) {
          case "ebay":
            return {
              clientId: env.EBAY_CLIENT_ID,
              clientSecret: env.EBAY_CLIENT_SECRET,
            };
          case "shopify": {
            if (!options?.shopUrl) {
              throw new Error(
                "Shopify credentials require a shopUrl from the channel"
              );
            }
            return {
              clientId: env.SHOPIFY_CLIENT_ID,
              clientSecret: env.SHOPIFY_CLIENT_SECRET,
              shopUrl: options.shopUrl,
            };
          }
          default:
            throw new Error(
              `No credentials configured for marketplace: ${marketplaceId}`
            );
        }
      },
      getAppCredentials: (marketplaceId: MarketplaceType) => {
        switch (marketplaceId) {
          case "ebay":
            return {
              clientId: env.EBAY_CLIENT_ID,
              clientSecret: env.EBAY_CLIENT_SECRET,
            };
          case "shopify":
            return {
              clientId: env.SHOPIFY_CLIENT_ID,
              clientSecret: env.SHOPIFY_CLIENT_SECRET,
            };
          default:
            throw new Error(
              `No app credentials configured for marketplace: ${marketplaceId}`
            );
        }
      },
    },
    geo: createGeocoder("rollo", { apiKey: env.ROLLO_API_KEY }),
  };
  return { ctx, close };
}
