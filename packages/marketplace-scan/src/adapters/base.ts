/**
 * ScanClient — the unified interface for fetching read-only research data
 * from a marketplace (other people's listings, sellers, etc.).
 *
 * Mirrors the `ApiClient` pattern in `@dashseller/marketplace` but for
 * scanner concerns. Workflows depend on this interface, not on specific
 * marketplace implementations — the factory in `index.ts` returns the right
 * concrete class based on a marketplace string.
 *
 * `getListing` is the only method that returns the unified `ScanListing`
 * shape today (PR1). `getSeller`, `getSellerListings`, `searchListings`
 * still return marketplace-specific shapes pending follow-up unification.
 *
 * Auth: the client receives a `getAuthToken` provider that returns a
 * plaintext bearer. Encryption-at-rest is the caller's concern (the trigger
 * workflow uses `MobileProfileTokenManager`, which decrypts device
 * credentials from `mobile_profile.credentials`, mints a fresh bearer via
 * `getAuthToken`, and caches it on the row). The provider is awaited once
 * per adapter call, so a pool implementation can hand out a fresh persona
 * (and a fresh re-mint when the cached bearer expires) per request.
 *
 * Persona: the same decrypted credentials blob used to mint the bearer is
 * also handed to the data client via `credentials`. Each adapter picks
 * what it needs — shop reads `deviceId`/`deviceIdHw`/`deviceName` and sends
 * them as headers on every call; eBay ignores it today since the bearer
 * alone is sufficient for the data endpoints in use.
 */

import type { ScanListing } from "../types";
import type { GetSellerOptions, GetSellerResult } from "./ebay/api/get-seller";
import type {
  GetSellerListingsOptions,
  GetSellerListingsResult,
} from "./ebay/api/get-seller-listings";
import type {
  SearchListingsOptions,
  SearchListingsResult,
} from "./ebay/api/search-listings";
import type { EbayCredentials } from "./ebay/auth/get-new-token";
import type { ShopCredentials } from "./shop/auth/get-new-token";

/** Supported scan marketplaces. */
export type ScanMarketplaceType = "ebay" | "shop";

/**
 * Discovery surfaces an adapter implements. `getListing` is mandatory for
 * every adapter; keyword search and seller catalog walks stay optional until
 * their marketplace-specific shapes are unified. Callers that fan out
 * keyword or seller work (the scan crons) must check these before launching:
 * an unimplemented method rejects with a bare error that persona failure
 * routing would otherwise count against the persona.
 */
export interface ScanCapabilities {
  /** `searchListings` is implemented. */
  keywordSearch: boolean;
  /** `getSeller` and `getSellerListings` are implemented. */
  sellerCatalog: boolean;
}

/**
 * Per-adapter credential shapes — same blob the caller decrypted to mint
 * the bearer. Each adapter narrows internally (eBay by `"hmacKey" in c`,
 * shop by `"deviceIdHw" in c`); the union carries no in-line discriminator
 * so the storage layer's "app column is the source of truth" rule still
 * holds end-to-end.
 */
export type ScanCredentials = EbayCredentials | ShopCredentials;

/**
 * Configuration for `createScanClient`. The `getAuthToken` provider is
 * called once per adapter request, so token rotation lives outside the
 * client. Sandbox usage typically wraps an env var; trigger workflows wrap
 * a DB-backed profile pool, calling `decryptSecret` in the loader.
 *
 * `credentials` is the persona's decrypted credentials blob — adapters
 * cherry-pick from it (shop reads the three device fingerprint fields,
 * eBay ignores it today).
 */
export interface ScanClientConfig {
  credentials: ScanCredentials;
  getAuthToken: () => Promise<string>;
}

/** Unified shape returned by `ScanClient.getListing`. */
export interface ScanGetListingOptions {
  /** Marketplace's listing identifier (eBay item id, Shopify product id, etc.). */
  listingId: string;
}

export interface ScanGetListingResult {
  /**
   * Form for `scan_listing` (+ nested `scan_listing_variant` children).
   * The FK to `scan_seller` is established via `listing.sellerReference`
   * (the marketplace's seller id) — the upsert layer looks up the row id.
   * Full seller details (display name, reputation) are populated by the
   * separate `getSeller` adapter, not this one.
   */
  listing: ScanListing;
  /** Raw marketplace response — opaque at the interface level. */
  raw: unknown;
}

export interface ScanClient {
  /**
   * Listing id → unified `ScanListing` (matches `scan_listing` columns +
   * variants). Each adapter does its own marketplace-specific fetch +
   * mapping; the return shape is uniform.
   */
  getListing(options: ScanGetListingOptions): Promise<ScanGetListingResult>;

  getMarketplaceId(): string;

  /** See `getSeller` in the eBay adapter. Marketplace-specific shape pending follow-up. */
  getSeller(
    options: Omit<GetSellerOptions, "authToken">
  ): Promise<GetSellerResult>;

  /** See `getSellerListings` in the eBay adapter. Marketplace-specific shape pending follow-up. */
  getSellerListings(
    options: Omit<GetSellerListingsOptions, "authToken">
  ): Promise<GetSellerListingsResult>;

  /** See `searchListings` in the eBay adapter. Marketplace-specific shape pending follow-up. */
  searchListings(
    options: Omit<SearchListingsOptions, "authToken">
  ): Promise<SearchListingsResult>;
}
