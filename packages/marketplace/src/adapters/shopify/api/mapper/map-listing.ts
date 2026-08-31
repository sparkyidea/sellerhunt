import { convert } from "html-to-text";
import type { Listing } from "../../../../types";
import { convertListingStatus } from "../../enums";
import type { ShopifyProductStatus } from "../../raw-types";
import { stripGid } from "../helper/strip-gid";
import { mapVariants, type ShopifyVariantNode } from "./map-variants";

const TRAILING_SLASH_RE = /\/+$/;

export interface ShopifyProductImage {
  altText: string | null;
  id: string;
  url: string;
}

/**
 * Shopify's `Product` — which is OUR `listing`, not our `product`.
 *
 * Rule: CHN-007. A Shopify Product is scoped to one shop, so it is channel
 * data. Our `product` is the channel-agnostic spine across channels and has
 * no marketplace counterpart at all — it is created locally, 1:1 per imported
 * listing. Mapping this into `product` would put channel data in the catalog
 * and fail silently: rows land, types check, catalog is wrong.
 *
 * Dictionary: `.domain/channels/terminology.md`.
 */
export interface ShopifyProductNode {
  category: { fullName: string; id: string; name: string } | null;
  createdAt: string;
  descriptionHtml: string | null;
  handle: string;
  id: string;
  images: { edges: Array<{ node: ShopifyProductImage }> };
  onlineStoreUrl: string | null;
  productType: string | null;
  publishedAt: string | null;
  status: ShopifyProductStatus | string;
  title: string;
  totalInventory: number | null;
  updatedAt: string;
  variants: { edges: Array<{ node: ShopifyVariantNode }> };
  vendor: string | null;
}

export interface MapListingContext {
  /** Canonical shop URL (e.g. `https://mystore.myshopify.com`) — used to
   * synthesize a storefront URL when `onlineStoreUrl` is null (unpublished or
   * password-protected stores). */
  shopUrl: string;
}

function extractImageUrls(product: ShopifyProductNode): string[] {
  return product.images.edges.map((edge) => edge.node.url);
}

function buildListingUrl(product: ShopifyProductNode, shopUrl: string): string {
  if (product.onlineStoreUrl) {
    return product.onlineStoreUrl;
  }
  // Synthesize the canonical product URL from shop + handle. This matches the
  // public storefront path even when the store isn't published yet, so the
  // synced URL stays stable once the store goes live.
  const trimmed = shopUrl.replace(TRAILING_SLASH_RE, "");
  return `${trimmed}/products/${product.handle}`;
}

/**
 * Map a Shopify product to a normalized {@link Listing}. eBay-only fields are
 * set to null/false because Shopify has no analog (no auctions, no offers, no
 * watch counts surfaced at the storefront level, no per-listing shipping).
 */
export function mapListing(
  product: ShopifyProductNode,
  context: MapListingContext
): Listing {
  const imageUrls = extractImageUrls(product);
  const variantNodes = product.variants.edges.map((edge) => edge.node);
  const listingVariants = mapVariants(product.id, variantNodes, imageUrls);
  const hasMultipleVariants = listingVariants.length > 1;

  const description = product.descriptionHtml
    ? convert(product.descriptionHtml)
    : "";

  return {
    marketplaceCategoryReference: stripGid(product.category?.id ?? ""),
    title: product.title,
    description,
    descriptionHtml: product.descriptionHtml || null,
    brand: product.vendor || null,
    manufacturer: null,
    condition: "Unknown",
    conditionNote: null,
    imageUrls: imageUrls.length > 0 ? imageUrls : null,
    variant: hasMultipleVariants,
    reference: stripGid(product.id),
    // True modification clock — Shopify products expose updatedAt.
    sourceVersionAt: new Date(product.updatedAt),
    // updatedAt is a MODIFICATION clock, not an observation clock — it can
    // be arbitrarily old, so it must never become the seed cutoff.
    observedAt: null,
    subTitle: null,
    type: "fixed",
    url: buildListingUrl(product, context.shopUrl),
    watchCount: null,
    viewCount: null,
    duration: null,
    status: convertListingStatus({
      status: product.status,
      totalInventory: product.totalInventory,
    }),
    offer: null,
    offerAcceptPrice: null,
    offerDeclinePrice: null,
    domesticReturn: false,
    domesticReturnWindow: null,
    domesticReturnPaidBy: null,
    internationalReturn: false,
    internationalReturnWindow: null,
    internationalReturnPaidBy: null,
    restockingFee: null,
    localPickup: false,
    handlingTime: 1,
    handlingFee: null,
    domesticShipping: false,
    domesticShippingType: null,
    domesticShippingBaseFee: null,
    domesticShippingAdditionalFee: null,
    internationalShipping: false,
    internationalShippingType: null,
    internationalShippingBaseFee: null,
    internationalShippingAdditionalFee: null,
    startedAt: product.publishedAt
      ? new Date(product.publishedAt)
      : new Date(product.createdAt),
    endedAt: null,
    listingVariants,
  };
}
