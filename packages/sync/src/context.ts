import type { Database } from "@dashseller/db/client";
import type { Geocoder } from "@dashseller/geo/types";
import type { AppConfig, MarketplaceType } from "@dashseller/marketplace/types";

/**
 * Structured logger contract. Implementations: Trigger.dev's `logger` during
 * the migration window, pino in `apps/worker`, a capture array in tests.
 */
export interface SyncLogger {
  error(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Injectable clock. Domain code never calls `new Date()` for "now" — tests
 * pin time, and the listing observation clock uses SQL `now()` instead
 * (never this clock; see the version-clock rules).
 */
export interface SyncClock {
  now(): Date;
}

export const systemClock: SyncClock = {
  now: () => new Date(),
};

export interface SyncMarketplaceCredentials {
  clientId: string;
  clientSecret: string;
  /**
   * Storefront URL for per-shop marketplaces (Shopify). Loaded from
   * `channel.reference` at the call site — one merchant runs many shops.
   */
  shopUrl?: string;
}

/**
 * Credential access for domain code. Pure interface — the process shell
 * (worker, trigger-sync, tests) builds it from its own validated env; this
 * package never reads environment variables.
 */
export interface SyncCredentials {
  /** Key for `encryptSecret`/`decryptSecret` on stored channel tokens. */
  encryptionSecret: string;
  /** App-scoped (developer portal) credential pair for `createAppClient`. */
  getAppCredentials(marketplaceId: MarketplaceType): AppConfig;
  /** Seller-scoped OAuth credentials for `createApiClient`. */
  getMarketplaceCredentials(
    marketplaceId: MarketplaceType,
    options?: { shopUrl?: string | null }
  ): SyncMarketplaceCredentials;
}

/**
 * Everything the sync domain core is allowed to touch. Constructed once per
 * process by the shell and threaded through every port — no globals, no env
 * reads, no job-runner imports inside domain code.
 */
export interface SyncContext {
  clock: SyncClock;
  credentials: SyncCredentials;
  db: Database;
  geo: Geocoder;
  logger: SyncLogger;
}
