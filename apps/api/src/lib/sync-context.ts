import { db } from "@dashseller/db";
import { env } from "@dashseller/env/server";
import { createGeocoder } from "@dashseller/geo";
import type { MarketplaceType } from "@dashseller/marketplace/types";
import type { SyncContext } from "@dashseller/sync";
import { systemClock } from "@dashseller/sync";
import { getAppCredentials } from "./marketplace-credentials";

let ctx: SyncContext | undefined;

/**
 * The API's SyncContext — used where apps/api calls `@dashseller/sync`
 * cores directly (subscription reconcile at connect, backfill script).
 * Built on the API's env-validated singletons; the worker has its own.
 */
export function getApiSyncContext(): SyncContext {
  if (!ctx) {
    ctx = {
      db,
      clock: systemClock,
      logger: {
        info: (message, meta) => console.log(message, meta ?? ""),
        warn: (message, meta) => console.warn(message, meta ?? ""),
        error: (message, meta) => console.error(message, meta ?? ""),
      },
      credentials: {
        encryptionSecret: env.ENCRYPTION_SECRET,
        getAppCredentials,
        getMarketplaceCredentials: (
          marketplaceId: MarketplaceType,
          options?: { shopUrl?: string | null }
        ) => {
          const base = getAppCredentials(marketplaceId);
          if (marketplaceId === "shopify") {
            if (!options?.shopUrl) {
              throw new Error(
                "Shopify credentials require a shopUrl from the channel"
              );
            }
            return { ...base, shopUrl: options.shopUrl };
          }
          return base;
        },
      },
      geo: createGeocoder("rollo", { apiKey: env.ROLLO_API_KEY }),
    };
  }
  return ctx;
}
