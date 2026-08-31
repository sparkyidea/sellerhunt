import { db } from "@dashseller/db";
import { env } from "@dashseller/env/trigger-sync";
import { createGeocoder } from "@dashseller/geo";
import { type SyncContext, systemClock } from "@dashseller/sync";
import { logger } from "@trigger.dev/sdk/v3";

let ctx: SyncContext | undefined;

/**
 * The one SyncContext for this deployment: the shared db singleton,
 * Trigger.dev's logger, and the geocoder the tracking upserts resolve
 * event coordinates with. This worker is tracking-only — marketplace sync
 * runs in `apps/worker` — so the credential surface is deliberately
 * absent: any code path that reaches for it is a bug, and throws.
 */
export function getSyncContext(): SyncContext {
  if (!ctx) {
    ctx = {
      db,
      clock: systemClock,
      logger: {
        error: (message, meta) => logger.error(message, meta),
        info: (message, meta) => logger.info(message, meta),
        warn: (message, meta) => logger.warn(message, meta),
      },
      credentials: {
        get encryptionSecret(): string {
          throw new Error(
            "Marketplace credentials are not available in the tracking-only Trigger worker"
          );
        },
        getMarketplaceCredentials: () => {
          throw new Error(
            "Marketplace credentials are not available in the tracking-only Trigger worker"
          );
        },
        getAppCredentials: () => {
          throw new Error(
            "Marketplace credentials are not available in the tracking-only Trigger worker"
          );
        },
      },
      geo: createGeocoder("rollo", { apiKey: env.ROLLO_API_KEY }),
    };
  }
  return ctx;
}
