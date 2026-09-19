import type { ScanListing } from "../../../../types";
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
  /** Complete set including the native default. */
  variants: ParsedVariant[];
}

export function mapListing(input: MapListingInput): ScanListing {
  const { product, listingId, variants } = input;
  const mappedVariants = mapVariants(variants);
  if (
    variants.length === 0 ||
    variants.length !== product.variantsCount ||
    new Set(mappedVariants.map((v) => v.reference)).size !== variants.length
  ) {
    throw new Error("Incomplete or duplicate Shop variants");
  }

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

    // Shopify products don't have eBay-style auction lifecycle.
    startedAt: null,
    endedAt: null,

    // shop.app only surfaces a 30-day window, not lifetime or 24h.
    itemSold: null,
    soldLast24h: null,
    soldLast30Days: product.soldLast30Days,

    variants: mappedVariants,
  };
}
