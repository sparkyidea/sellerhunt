/**
 * Public types for `@dashseller/marketplace-scan`. Consumers import from
 * `@dashseller/marketplace-scan/types`. The contract interface and
 * supporting config types live in `adapters/base.ts` and are re-exported
 * here so this file is the single import surface for callers.
 */

export type {
  ScanClient,
  ScanClientConfig,
  ScanCredentials,
  ScanGetListingOptions,
  ScanGetListingResult,
  ScanMarketplaceType,
} from "./adapters/base";

/**
 * Result returned by `getScanToken` (the factory dispatcher) and its
 * per-adapter orchestrators (`adapters/<provider>/auth/get-token.ts`).
 *
 * `refreshToken` is shop-only (eBay's grant returns none).
 * `refreshTokenExpiresAt` is populated only when the upstream surfaces a
 * refresh-token TTL; shop.app's `SignInAsGuest` does not, so it stays null
 * for shop today.
 */
export interface ScanTokenResult {
  accessToken: string;
  expiresAt: Date;
  raw: unknown;
  refreshToken?: string;
  refreshTokenExpiresAt?: Date;
}

/**
 * Unified scan output types — one type per DB table, modeling the columns
 * each adapter is expected to fill in ("the form").
 *
 * Modeled column-for-column on the scan listing / variant / seller persisted
 * forms. Adapters call their own raw endpoints, parse marketplace-specific
 * shapes, then map into these types so `ScanClient.getListing` returns the
 * same structure regardless of source.
 *
 * Excluded from each form (the upsert/DB layer owns them):
 *   - `id` (uuid PK)
 *   - `createdAt`, `updatedAt` (auto-managed)
 *   - `lastScannedAt` (set on upsert)
 *   - `monitored` (operator opt-in, not adapter-driven)
 *
 * `sellerId` (the FK on scan_listing) is replaced by `sellerReference` (the
 * marketplace's seller identifier as a string); the upsert layer looks up
 * `scan_seller.id` from `(marketplace, sellerReference)` and threads the
 * resolved id into the row.
 *
 * Money fields are integer **cents** — the mapper converts at the boundary
 * (`Math.round(value * 100)`), matching the seller-side `@dashseller/marketplace`
 * pattern (`map-listing.ts:58`, `map-variants.ts`). The upsert and the
 * threshold checker consume cents directly; no further conversion downstream.
 *
 * Variants are nested on `ScanListing` because they're a child relation of
 * the same row (mirrors the `Listing.listingVariants` pattern in
 * `@dashseller/marketplace`). `ScanSellerRef` is a SIBLING form, not nested
 * — it maps to its own table and is upserted separately by the workflow.
 */

/**
 * Form for a single `scan_listing` row + its `scan_listing_variant` children.
 * Every property here is a column on `scan_listing` (or, in the case of
 * `variants`, the children of one).
 */
export interface ScanListing {
  /** Category breadcrumb names, root → leaf. */
  categoryPath: string[] | null;
  /** Human-readable condition string (e.g. "New/Factory Sealed"). Null when the marketplace doesn't surface condition. */
  condition: string | null;
  /** ISO-4217 currency code. */
  currency: string | null;
  description: string | null;
  endedAt: Date | null;

  /** True when the marketplace flags this listing as Good-Till-Cancelled (eBay-specific concept). */
  goodTillCancelled: boolean | null;
  imageUrls: string[] | null;
  /** Lifetime sold count. eBay surfaces this; shop.app does not. */
  itemSold: number | null;
  /** Marketplace discriminator (e.g. "ebay", "shop"). */
  marketplace: string;
  /** Marketplace's leaf category id. Null when not surfaced (shop.app, etc). */
  marketplaceCategoryReference: string | null;

  /** Display price in **integer cents** (e.g. $5.99 → 599). Mapper converts. */
  price: number | null;
  /** Marketplace's listing identifier (eBay item id, Shopify product id, etc.). */
  reference: string;

  /**
   * Marketplace-scoped seller identifier — the FK target on `scan_listing.seller_id`.
   * Resolved to a `scan_seller.id` by `upsertScanListing`. Null when the
   * listing source didn't surface a seller (rare, but possible for partial
   * fetches).
   */
  sellerReference: string | null;
  /** eBay-only: sparse 24h hotness signal. Null on shop. */
  soldLast24h: number | null;
  /** Shop-only: approximate quantity sold in last 30 days. Null on eBay. */
  soldLast30Days: number | null;
  startedAt: Date | null;

  title: string;
  url: string | null;
  /** True when the listing has multiple variations — drives variant fan-out at the upsert layer. */
  variant: boolean;

  /**
   * Children — `scan_listing_variant` rows. Empty array when the listing has
   * no real variation (Shopify "Default Title" placeholder is suppressed).
   * Mirrors the `Listing.listingVariants` pattern in `@dashseller/marketplace`.
   */
  variants: ScanListingVariant[];
}

/** Form for a single `scan_listing_variant` row. `listingId` is resolved at the upsert boundary. */
export interface ScanListingVariant {
  /** Option name → value, e.g. {"Color": "Red", "Size": "M"}. Null when the variant has no options. */
  attributes: Record<string, string> | null;
  /** Variant images (typically 0 or 1). Null when the variant has no image. */
  imageUrls: string[] | null;
  /** Display price in **integer cents** (e.g. $5.99 → 599). */
  price: number | null;
  /** Marketplace's variant identifier (Shopify variant gid, eBay variationId, etc.). */
  reference: string;
}

/**
 * Form for a single `scan_seller` row. Sibling form to `ScanListing` — not
 * embedded in it, because `scan_seller` is its own table and the FK
 * relationship is established by `(marketplace, reference)` lookup at the
 * upsert boundary, not by nesting.
 *
 * Returned alongside `ScanListing` from `getListing` when the listing
 * endpoint surfaces seller info; the workflow upserts it before the listing
 * so the FK resolves.
 */
export interface ScanSeller {
  displayName: string | null;
  /** Positive feedback ratio in 0..1 (e.g. 0.998 for 99.8%). */
  feedbackPercent: number | null;
  feedbackScore: number | null;
  logoUrl: string | null;
  marketplace: string;
  reference: string;
  totalItemsSold: number | null;
}
