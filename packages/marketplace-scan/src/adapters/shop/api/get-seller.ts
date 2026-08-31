/**
 * Seller id → store metadata, via shop.app's `StoreMeta` GraphQL operation
 * against `server.shop.app/graphql`.
 *
 * This is the iOS app's store-page query — covers identity (Shopify GID,
 * myshopify domain, name, share URL), shipping origin, review aggregates,
 * brand visuals (logo, featured images, header cover, brand colors), and
 * navigation. shop.app does not surface follower count, lifetime items sold,
 * or seller registration date through this endpoint, so those map to `null`
 * on the parsed seller; consumers needing those signals must use a different
 * source.
 *
 * The `sellerId` option is the bare numeric shop.app shop identifier (e.g.
 * `"165053"` for the captured Knix store) — same value `getSellerListings`
 * consumes. Distinct from the GraphQL node `id` (`gid://shop-app/Shop/...`)
 * and from `shopifyId` (`gid://shopify/Shop/...`). Internally shop.app's
 * GraphQL refers to this as `brokerId`; we keep that name only at the wire
 * layer (`variables: { id }` on the StoreMeta operation) and expose
 * `sellerId` everywhere else for parity with the eBay adapter.
 *
 * Same caveats as the rest of `marketplace-scan`: not a documented API,
 * GraphQL shape can change without notice, bearer-token auth is unofficial.
 */
import { shopGraphqlFetch } from "../http";

export interface GetSellerOptions {
  /** Bearer token minted via `getAuthToken`. */
  authToken: string;
  /** Per-install UUID matching the persona that minted the bearer. */
  deviceId: string;
  /** Hardware UUID matching the persona that minted the bearer. */
  deviceIdHw: string;
  /** Display name matching the persona that minted the bearer. */
  deviceName: string;
  /**
   * Numeric shop.app shop identifier (e.g. `"165053"`). The same value
   * `getSellerListings` consumes — used uniformly across scan adapters as
   * `sellerId`. Internally shop.app calls this `brokerId` in its GraphQL
   * variables; we keep that name only at the wire layer.
   *
   * Distinct from the `Shop` GraphQL node id (`gid://shop-app/Shop/...`)
   * and from `shopifyId` (`gid://shopify/Shop/...`).
   */
  sellerId: string;
}

export interface GetSellerResult {
  /** Raw GraphQL response. Use for shape-drift inspection. */
  raw: ShopStoreMetaResponse;
  /** Parsed seller — fields populated based on what the GraphQL response exposes. */
  seller: ShopSeller;
  /** Echoed for convenience. */
  sellerId: string;
}

export interface ShopSeller {
  /** Average product rating across the shop (0..5), or null when no reviews. */
  averageRating: number | null;
  /** Header cover image URL (the wide banner above the store). */
  coverImageUrl: string | null;
  /** Brand description / about copy. */
  description: string | null;
  /** Active discount IDs surfaced for this shop. Always an array. */
  discountIds: string[];
  /** Featured/cover image URLs in display order. Always an array. */
  featuredImageUrls: string[];
  /** Featured collection/handle assignments (e.g. "shop-featured"). Always an array. */
  featuredInHandles: string[];
  /** True when the calling persona is currently following this shop. */
  followedByMe: boolean | null;
  /** GraphQL node id (e.g. `gid://shop-app/Shop/165053`). */
  id: string | null;
  /** Logo image URL. */
  logoUrl: string | null;
  /** Custom Shopify domain (e.g. "knix-com.myshopify.com"). */
  myshopifyDomain: string | null;
  /** Shop display name. */
  name: string | null;
  /** shop.app share URL — surfaces the store on shop.app's web/app surface. */
  shareUrl: string | null;
  /**
   * Country the shop ships from (e.g. "US"). Sourced from the StoreMeta
   * `shippingInfo.country` field — null when shop.app doesn't surface it.
   */
  shippingFromCountry: string | null;
  /**
   * Whether the shop ships to the calling persona's country. Persona-bound
   * (depends on the device's locale) — null when shop.app omits the field.
   */
  shipsToCountry: boolean | null;
  /** Shopify GID for the shop (e.g. `gid://shopify/Shop/123`). */
  shopifyId: string | null;
  /** Shop network indicator (e.g. "shop_app"). */
  shopNetwork: string | null;
  /** True when the shop is eligible for shop.app store features. */
  storeEligible: boolean | null;
  /**
   * Total product ratings count (number of "stars" submissions, may exceed
   * `totalProductReviews` because ratings can be left without a written review).
   */
  totalProductRatings: number | null;
  /** Total product reviews count (written reviews). */
  totalProductReviews: number | null;
  /** shop.app shop UUID. */
  uuid: string | null;
  /** Merchant's primary website URL. */
  websiteUrl: string | null;
}

export async function getSeller(
  options: GetSellerOptions
): Promise<GetSellerResult> {
  const raw = await shopGraphqlFetch<ShopStoreMetaResponse>({
    endpoint: "shop.get-seller",
    operationName: "StoreMeta",
    // shop.app's GraphQL `Shop(id: ID!)` takes the bare numeric shop id —
    // the same value the iOS app refers to as `brokerId` internally.
    variables: { id: options.sellerId },
    query: STORE_META_QUERY,
    headers: {
      Authorization: `Bearer ${options.authToken}`,
      "x-device-id": options.deviceId,
      "x-device-id-hw": options.deviceIdHw,
      "x-device-name": options.deviceName,
    },
  });

  return {
    raw,
    seller: parseSeller(raw),
    sellerId: options.sellerId,
  };
}

// ===========================================================================
// Internals: parsing
// ===========================================================================

function parseSeller(raw: ShopStoreMetaResponse): ShopSeller {
  const shop = raw.data?.shop;
  if (!shop) {
    return emptySeller();
  }
  const reviews = shop.productReviewAnalytics ?? null;
  const visualTheme = shop.visualTheme ?? null;
  const headerTheme = visualTheme?.brandSettings?.headerTheme ?? null;

  return {
    averageRating: pickFiniteNumber(reviews?.averageRating),
    coverImageUrl: headerTheme?.coverImage?.url ?? null,
    description: visualTheme?.description ?? null,
    discountIds: extractIds(shop.discounts),
    featuredInHandles: extractFeaturedInHandles(shop.featuredIn),
    featuredImageUrls: extractImageUrls(visualTheme?.featuredImages),
    followedByMe: pickBoolean(shop.followedByMe),
    id: shop.id ?? null,
    logoUrl: visualTheme?.logoImage?.url ?? null,
    myshopifyDomain: shop.myshopifyDomain ?? null,
    name: shop.name ?? null,
    shareUrl: shop.shareUrl ?? null,
    shippingFromCountry: shop.shippingInfo?.country ?? null,
    shipsToCountry: pickBoolean(shop.shippingInfo?.shipsToCountry),
    shopNetwork: shop.shopNetwork ?? null,
    shopifyId: shop.shopifyId ?? null,
    storeEligible: pickBoolean(shop.storeEligible),
    totalProductRatings: pickFiniteNumber(reviews?.totalProductRatings),
    totalProductReviews: pickFiniteNumber(reviews?.totalProductReviews),
    uuid: shop.uuid ?? null,
    websiteUrl: shop.websiteUrl ?? null,
  };
}

function emptySeller(): ShopSeller {
  return {
    averageRating: null,
    coverImageUrl: null,
    description: null,
    discountIds: [],
    featuredInHandles: [],
    featuredImageUrls: [],
    followedByMe: null,
    id: null,
    logoUrl: null,
    myshopifyDomain: null,
    name: null,
    shareUrl: null,
    shippingFromCountry: null,
    shipsToCountry: null,
    shopNetwork: null,
    shopifyId: null,
    storeEligible: null,
    totalProductRatings: null,
    totalProductReviews: null,
    uuid: null,
    websiteUrl: null,
  };
}

function extractIds(
  nodes: Array<{ id?: string }> | null | undefined
): string[] {
  if (!nodes) {
    return [];
  }
  const out: string[] = [];
  for (const node of nodes) {
    if (typeof node?.id === "string" && node.id.length > 0) {
      out.push(node.id);
    }
  }
  return out;
}

function extractFeaturedInHandles(
  nodes: Array<{ handle?: string }> | null | undefined
): string[] {
  if (!nodes) {
    return [];
  }
  const out: string[] = [];
  for (const node of nodes) {
    if (typeof node?.handle === "string" && node.handle.length > 0) {
      out.push(node.handle);
    }
  }
  return out;
}

function extractImageUrls(
  images: Array<{ url?: string }> | null | undefined
): string[] {
  if (!images) {
    return [];
  }
  const out: string[] = [];
  for (const image of images) {
    if (typeof image?.url === "string" && image.url.length > 0) {
      out.push(image.url);
    }
  }
  return out;
}

function pickFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function pickBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

// ===========================================================================
// Internals: response shape
//
// Hand-typed from the StoreMeta operation in the captured curl. Only the
// fields the parser reads are typed; everything else is left open via
// `Record<string, unknown>` on parents so shape drift surfaces at the
// extraction sites rather than deep in the type tree.
// ===========================================================================

export interface ShopStoreMetaResponse {
  data?: {
    shop?: ShopStoreMetaShop | null;
  };
  errors?: Array<{ message?: string }>;
}

interface ShopStoreMetaShop {
  discounts?: Array<{ id?: string }> | null;
  featuredIn?: Array<{ handle?: string }> | null;
  followedByMe?: boolean | null;
  id?: string | null;
  myshopifyDomain?: string | null;
  name?: string | null;
  productReviewAnalytics?: {
    averageRating?: number | null;
    totalProductRatings?: number | null;
    totalProductReviews?: number | null;
  } | null;
  shareUrl?: string | null;
  shippingInfo?: {
    country?: string | null;
    shipsToCountry?: boolean | null;
  } | null;
  shopifyId?: string | null;
  shopNetwork?: string | null;
  storeEligible?: boolean | null;
  uuid?: string | null;
  visualTheme?: {
    brandSettings?: {
      headerTheme?: {
        coverImage?: { url?: string } | null;
      } | null;
    } | null;
    description?: string | null;
    featuredImages?: Array<{ url?: string }> | null;
    logoImage?: { url?: string } | null;
  } | null;
  websiteUrl?: string | null;
}

// ===========================================================================
// GraphQL operation — verbatim from the iOS app capture.
//
// Embedded as a string constant rather than loaded from a `.graphql` file so
// the package has no runtime resource lookup. Don't trim fragments without
// re-capturing — shop.app's gateway may track operation hashes for caching.
// ===========================================================================

const STORE_META_QUERY = `query StoreMeta($id: ID!, $adToken: String) {
  shop(id: $id, adToken: $adToken) {
    shopifyId
    myshopifyDomain
    name
    adjustProductImageAspectRatio
    nativeProductPagesEnabled
    websiteUrl
    showBrandedHeaderV2
    shippingInfo {
      country
      shipsToCountry
      __typename
    }
    ...StoreCommon
    discounts {
      id
      __typename
    }
    featuredIn {
      handle
      __typename
    }
    __typename
  }
}

fragment StoreCommon on Shop {
  id
  uuid
  shopNetwork
  storeEligible
  followedByMe
  shareUrl
  visualTheme {
    ...VisualTheme
    __typename
  }
  navigationItems {
    id
    title
    heroImage {
      ...ReducedImage
      __typename
    }
    __typename
  }
  productReviewAnalytics {
    totalProductReviews
    totalProductRatings
    averageRating
    __typename
  }
  referral
  __typename
}

fragment VisualTheme on VisualTheme {
  id
  logoImage {
    ...ReducedImage
    __typename
  }
  featuredImages {
    ...ReducedImage
    __typename
  }
  description
  brandSettings {
    ...BrandSettings
    __typename
  }
  __typename
}

fragment ReducedImage on Image {
  url
  altText
  height
  width
  sensitive
  thumbhash
  __typename
}

fragment BrandSettings on BrandSettings {
  id
  colors {
    id
    primary
    secondary
    secondaryText
    statusBarStyle
    logoAverage
    logoDominant
    coverDominant
    __typename
  }
  logos {
    id
    logoImage {
      ...ReducedImage
      __typename
    }
    __typename
  }
  headerTheme {
    id
    coverImage {
      ...ReducedImage
      __typename
    }
    thumbnailImage {
      ...ReducedImage
      __typename
    }
    wordmark {
      ...ReducedImage
      __typename
    }
    videoUrl
    startingScrimColor
    endingScrimColor
    __typename
  }
  __typename
}
`;
