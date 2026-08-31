/**
 * Shop.app parsed product + variants → unified `ScanListing` (the form for
 * one `scan_listing` row + its nested variant children).
 *
 * Pure function — exported separately so it's unit-testable and so the
 * shape-mapping logic stays out of the network/orchestration code in
 * `getListing`. Field-level decisions documented inline.
 *
 * The mapper sets `listing.sellerReference` to the shop's `sellerId` so the
 * FK to `scan_seller` resolves at the upsert boundary. (shop.app's GraphQL
 * calls this value `brokerId` internally; we use `sellerId` for parity with
 * the eBay adapter.) The full seller form (display name, logo, reputation)
 * is NOT produced here — that's the job of the `getSeller` adapter, called
 * separately.
 *
 * Variant pattern: always emits at least one variant row, mirroring
 * `packages/marketplace`'s seller-side mapper (`Listing.listingVariants`).
 * Single-variant Shopify products (incl. the "Default Title" placeholder)
 * still get one variant entry with `attributes: null`; the listing-level
 * `variant: boolean` only flips true when there are MULTIPLE variants.
 */
import type { ScanListing } from "../../../../types";
import { toCents } from "../../../../utils/to-cents";
import type { ParsedVariant } from "../get-adjacent-variants";
import { mapVariants } from "./map-variants";

const MARKETPLACE_ID = "shop";

/**
 * Product-level fields the mapper consumes (everything not on a variant).
 * Defined by the orchestrator in `getListing`; the orchestrator picks the
 * fields out of the raw `ProductDetailsQuery` response.
 */
export interface ParsedProduct {
  /** Plain-text description (already extracted from descriptionHtml). */
  description: string | null;
  /** All product image URLs in display order. */
  imageUrls: string[];
  /** Direct link to the merchant's online storefront for this product. */
  onlineStoreUrl: string | null;
  /** Shop info parsed from the product's embedded `shop` block. Null when omitted. */
  shop: ParsedProductShop | null;
  /** Approximate quantity sold in last 30 days — the headline scanner metric for shop. */
  soldLast30Days: number | null;
  /** Product title. */
  title: string | null;
  /** Total variant count surfaced by `variantsCount.count`. */
  variantsCount: number | null;
}

export interface ParsedProductShop {
  /** Shop logo URL, when surfaced via `visualTheme.logoImage.url`. */
  logoUrl: string | null;
  /** Shop display name. */
  name: string | null;
  /**
   * Numeric shop.app shop id — the bare `shop.id` string from the GraphQL
   * response. Surfaces as `scan_listing.sellerReference` at the upsert
   * boundary. (shop.app's GraphQL refers to this internally as `brokerId`.)
   */
  sellerId: string | null;
  /** Shopify GID for the shop (e.g. `gid://shopify/Shop/123`). */
  shopifyId: string | null;
  /** shop.app shop UUID. */
  uuid: string | null;
  /** Merchant's primary website URL. */
  websiteUrl: string | null;
}

export interface MapListingInput {
  /**
   * Shopify product id (bare numeric, e.g. `"8404160315548"`) — used as the
   * `scan_listing.reference` value. shop.app's GraphQL calls this
   * `productId` on the wire; we expose `listingId` to match the rest of
   * the scan API surface (and `ScanGetListingOptions.listingId`).
   */
  listingId: string;
  product: ParsedProduct;
  /**
   * All variants for this product, in any order. The orchestrator should
   * have merged the first variant from `ProductDetailsQuery` with adjacent
   * variants from `AdjacentVariantsQuery`. The mapper picks the first
   * non-null-priced variant for listing-level `price`/`currency`, and
   * emits one `ScanListingVariant` per entry — single-variant products
   * (incl. "Default Title" placeholder) still produce one variant row;
   * `attributes` is set to null for placeholder option sets.
   */
  variants: ParsedVariant[];
}

export function mapListing(input: MapListingInput): ScanListing {
  const { product, listingId, variants } = input;
  const headlineVariant = pickHeadlineVariant(variants);

  return {
    marketplace: MARKETPLACE_ID,
    reference: listingId,

    sellerReference: product.shop?.sellerId ?? null,

    title: product.title ?? "",
    description: product.description,
    // shop.app doesn't surface a marketplace condition string on the product
    // detail endpoint — Shopify's storefront model has no condition concept.
    condition: null,
    // shop.app's product detail doesn't carry merchant category breadcrumbs.
    marketplaceCategoryReference: null,
    categoryPath: null,
    imageUrls: product.imageUrls.length > 0 ? product.imageUrls : null,
    url: product.onlineStoreUrl,
    // True only when the product has MULTIPLE variations — single-variant
    // products (incl. "Default Title" placeholder) still get one variant row,
    // but `variant: false` flags them as no-real-variation. Mirrors the
    // marketplace seller-side pattern.
    variant: variants.length > 1,

    // Shopify products don't have eBay-style auction lifecycle.
    goodTillCancelled: null,
    startedAt: null,
    endedAt: null,

    price: toCents(headlineVariant?.price ?? null),
    currency: headlineVariant?.currency ?? null,
    // shop.app only surfaces a 30-day window, not lifetime or 24h.
    itemSold: null,
    soldLast24h: null,
    soldLast30Days: product.soldLast30Days,

    // Always at least one variant — shop.app's API returns at least the
    // selected/first-available variant, so no synthesis is needed (unlike
    // the eBay seller-side mapper, which synthesizes via `mapSingleVariant`
    // for single-item listings). Pass-through via the dedicated mapper.
    variants: mapVariants(variants),
  };
}

/**
 * Prefer the first variant with a non-null price; fall back to the first
 * variant overall. Both `price` and `currency` come from the same source,
 * so `price/currency` on `ScanListing` represent the same variant.
 */
function pickHeadlineVariant(variants: ParsedVariant[]): ParsedVariant | null {
  if (variants.length === 0) {
    return null;
  }
  for (const v of variants) {
    if (v.price !== null) {
      return v;
    }
  }
  return variants[0] ?? null;
}
