/**
 * Seller id → page of listing refs, via shop.app's `ShopProductSearch`
 * GraphQL operation against `server.shop.app/graphql`.
 *
 * This is the iOS app's product-list-page query, scoped to a single shop. The
 * cursor is Relay-style opaque (server-tracked offset/last_id pair encoded as
 * double-base64 JSON) — clients just round-trip `pageInfo.endCursor` until
 * `hasNextPage` is false.
 *
 * Defaults match the captured iOS request: `searchKind: PRODUCT_LIST_PAGE_SEARCH`
 * with the in-stock + available filter set (so OOS listings are skipped).
 * Callers can override `filter` / `searchKind` if they need a different scope.
 *
 * Same caveats as the rest of `marketplace-scan`: not a documented API,
 * GraphQL shape can change without notice, bearer-token auth is unofficial.
 */
import { shopGraphqlFetch } from "../http";

/** Default page size. shop.app's gateway rejects `first > 30` with
 *  `"invalid first: N"` — 30 is the highest accepted value. */
const DEFAULT_FIRST = 30;
const MAX_FIRST = 30;

/** Filter set captured from the iOS app — restricts to in-stock/available
 *  products, which matches the scanner intent (we don't want OOS noise). */
const DEFAULT_FILTER: ShopSearchFilter[] = [
  { key: "inStock", value: true },
  { key: "dynamicFilterVAvailability", value: '{"available":true}' },
  { key: "collection" },
];

const DEFAULT_SEARCH_KIND = "PRODUCT_LIST_PAGE_SEARCH";

export interface GetSellerListingsOptions {
  /** Bearer token minted via `getAuthToken`. */
  authToken: string;
  /** Opaque pagination cursor — pass `nextCursor` from a previous page. */
  cursor?: string;
  /** Per-install UUID matching the persona that minted the bearer. */
  deviceId: string;
  /** Hardware UUID matching the persona that minted the bearer. */
  deviceIdHw: string;
  /** Display name matching the persona that minted the bearer. */
  deviceName: string;
  /**
   * Override the captured filter set. Defaults to the in-stock + available
   * filter (same as the iOS app's PLP). Pass `[]` to disable filtering.
   */
  filter?: ShopSearchFilter[];
  /** Page size. Defaults to 30. shop.app caps this at 30 server-side. */
  first?: number;
  /** GraphQL search kind. Defaults to "PRODUCT_LIST_PAGE_SEARCH". */
  searchKind?: string;
  /**
   * Numeric shop.app seller identifier (e.g. `"26275"` for Thrive Causemetics).
   * Same value `getSeller` consumes. Surfaced as `brokerId` in shop.app's
   * GraphQL variables — that wire-layer name is kept only inside the
   * request body. Distinct from the `Shop` GraphQL node id and from `shopifyId`.
   */
  sellerId: string;
}

export interface ShopSearchFilter {
  key: string;
  value?: string | boolean;
}

export interface GetSellerListingsResult {
  /** True when `pageInfo.hasNextPage` is true — feed `nextCursor` back to fetch the next page. */
  hasMore: boolean;
  /** Listing refs found on this page, in display order. */
  listings: ShopListingRef[];
  /** Cursor for the next page, or null when there are no more results. */
  nextCursor: string | null;
  /** Raw GraphQL response. Use for shape-drift inspection. */
  raw: ShopProductSearchResponse;
  /**
   * Total listings matching the filter for this seller. shop.app returns
   * `-1` as a sentinel meaning "uncounted" — surfaced here as `null`.
   * Inspect `raw.data.shopProductSearch.totalCountCapped` if you need to
   * distinguish "exactly N" from "≥ N".
   */
  totalCount: number | null;
}

/**
 * Lightweight listing identifier + display fields available on the search results
 * page. Use `getShopListing` (separate adapter) to get sold-last-30-days,
 * full description, variant stock, and other detail-page-only fields.
 */
export interface ShopListingRef {
  /** ISO-4217 currency code from the price. */
  currency: string | null;
  /** First image URL from the search card. */
  imageUrl: string | null;
  /** Shopify product GID (e.g. `gid://shopify/Product/8404160315548`). */
  listingId: string;
  /** Direct link to the product on the merchant's online store, when published. */
  listingUrl: string | null;
  /** Number of variants on the product. */
  numberOfVariants: number | null;
  /** Original (compare-at) price as a number, when discounted. */
  originalPrice: number | null;
  /** Display price as a number. */
  price: number | null;
  /** Average rating across all reviews, when available. */
  reviewAverageRating: number | null;
  /** Total review count. */
  reviewCount: number | null;
  /** shop.app share URL — surfaces the product on shop.app's web/app surface. */
  shareUrl: string | null;
  /** Listing title. */
  title: string;
}

export async function getSellerListings(
  options: GetSellerListingsOptions
): Promise<GetSellerListingsResult> {
  const requestedFirst = options.first ?? DEFAULT_FIRST;
  // shop.app's gateway rejects values >30 with "invalid first: N" — clamp
  // silently so callers don't have to know the magic ceiling.
  const first = Math.min(requestedFirst, MAX_FIRST);
  const filter = options.filter ?? DEFAULT_FILTER;
  const searchKind = options.searchKind ?? DEFAULT_SEARCH_KIND;

  const variables: Record<string, unknown> = {
    // `brokerId` is shop.app's GraphQL variable name for the seller id —
    // kept only at the wire layer; the option/echo field is `sellerId`.
    brokerId: options.sellerId,
    first,
    includeProductFilters: false,
    sortBy: null,
    filter,
    searchKind,
  };
  if (options.cursor) {
    variables.after = options.cursor;
  }

  const raw = await shopGraphqlFetch<ShopProductSearchResponse>({
    endpoint: "shop.get-seller-listings",
    operationName: "ShopProductSearch",
    variables,
    query: SHOP_PRODUCT_SEARCH_QUERY,
    headers: {
      Authorization: `Bearer ${options.authToken}`,
      "x-device-id": options.deviceId,
      "x-device-id-hw": options.deviceIdHw,
      "x-device-name": options.deviceName,
    },
  });

  const search = raw.data?.shopProductSearch ?? null;
  const listings = extractListings(search?.nodes);
  const pageInfo = search?.pageInfo ?? null;
  const hasMore = pageInfo?.hasNextPage === true;
  const nextCursor =
    hasMore && typeof pageInfo?.endCursor === "string"
      ? pageInfo.endCursor
      : null;

  const rawTotal = search?.totalCount;
  const totalCount =
    typeof rawTotal === "number" && rawTotal >= 0 ? rawTotal : null;

  return {
    hasMore,
    listings,
    nextCursor,
    raw,
    totalCount,
  };
}

// ===========================================================================
// Internals: parsing
// ===========================================================================

function extractListings(
  nodes: ShopSearchNode[] | undefined
): ShopListingRef[] {
  if (!nodes) {
    return [];
  }
  const out: ShopListingRef[] = [];
  for (const node of nodes) {
    // Search results can include non-product nodes (ads, banners). Filter by
    // typename — only DiscoveryProduct entries with a non-empty id become
    // listing refs.
    if (!node || node.__typename !== "DiscoveryProduct") {
      continue;
    }
    const id = node.id;
    if (typeof id !== "string" || id.length === 0) {
      continue;
    }
    out.push(toListingRef(node, id));
  }
  return out;
}

function toListingRef(p: ShopSearchNode, id: string): ShopListingRef {
  return {
    currency: p.price?.currencyCode ?? null,
    imageUrl: extractFirstImage(p.images),
    listingId: id,
    listingUrl: p.url ?? null,
    numberOfVariants:
      typeof p.numberOfVariants === "number" ? p.numberOfVariants : null,
    originalPrice: parseMoneyAmount(p.originalPrice?.amount),
    price: parseMoneyAmount(p.price?.amount),
    reviewAverageRating:
      typeof p.reviewAnalytics?.averageRating === "number"
        ? p.reviewAnalytics.averageRating
        : null,
    reviewCount:
      typeof p.reviewAnalytics?.count === "number"
        ? p.reviewAnalytics.count
        : null,
    shareUrl: p.shareUrl ?? null,
    title: p.title ?? "",
  };
}

function extractFirstImage(
  images: Array<{ url?: string }> | undefined
): string | null {
  if (!images) {
    return null;
  }
  for (const image of images) {
    if (typeof image?.url === "string" && image.url.length > 0) {
      return image.url;
    }
  }
  return null;
}

function parseMoneyAmount(amount: string | null | undefined): number | null {
  if (typeof amount !== "string" || amount.length === 0) {
    return null;
  }
  const n = Number.parseFloat(amount);
  return Number.isFinite(n) ? n : null;
}

// ===========================================================================
// Internals: response shape
//
// Hand-typed from the operation in the captured curl. Only the fields we
// extract are typed; everything else is left open via `Record<string,
// unknown>` on parents.
// ===========================================================================

export interface ShopProductSearchResponse {
  data?: {
    shopProductSearch?: ShopProductSearchConnection | null;
  };
  errors?: Array<{ message?: string }>;
}

interface ShopProductSearchConnection {
  nodes?: ShopSearchNode[];
  pageInfo?: {
    endCursor?: string | null;
    hasNextPage?: boolean;
  };
  totalCount?: number;
  totalCountCapped?: boolean;
}

interface ShopSearchNode {
  __typename?: string;
  id?: string;
  images?: Array<{ url?: string }>;
  numberOfVariants?: number;
  originalPrice?: ShopMoney | null;
  price?: ShopMoney | null;
  reviewAnalytics?: { averageRating?: number; count?: number };
  shareUrl?: string;
  // Populated when __typename === "DiscoveryProduct". Other node types are
  // ignored at the parser level.
  title?: string;
  url?: string;
}

interface ShopMoney {
  amount?: string;
  currencyCode?: string;
}

// ===========================================================================
// GraphQL operation — verbatim from the iOS app capture.
//
// Embedded as a string constant rather than loaded from a `.graphql` file so
// the package has no runtime resource lookup. Don't trim fragments without
// re-capturing — shop.app's gateway may track operation hashes for caching.
// ===========================================================================

const SHOP_PRODUCT_SEARCH_QUERY = `query ShopProductSearch($brokerId: ID!, $first: Int!, $after: String, $filter: [SearchFilterV2!], $sortBy: ShopProductSearchSortByV2, $query: String, $includeProductFilters: Boolean!, $searchKind: StoreSearchKind, $promotedProductId: ID) {
  shopProductSearch(
    brokerId: $brokerId
    first: $first
    after: $after
    filter: $filter
    sortBy: $sortBy
    searchKind: $searchKind
    query: $query
    promotedProductId: $promotedProductId
  ) {
    ...ProductSearch
    productFilters @include(if: $includeProductFilters) {
      ...ProductFilter
      __typename
    }
    __typename
  }
}

fragment ProductSearch on ProductSearchConnection {
  nodes {
    __typename
    id
    ... on DiscoveryProduct {
      id
      ...ProductCard
      __typename
    }
  }
  pageInfo {
    hasNextPage
    endCursor
    __typename
  }
  filter {
    network
    __typename
  }
  inferredCategoryFilters
  totalCount
  totalCountCapped
  inferredQueryType
  __typename
}

fragment ProductFilter on ProductFilter {
  key
  defaultValue
  value
  configurations {
    __typename
    ... on ProductFilterSheetConfiguration {
      __typename
      title
      icon
      screenTitle
      filterKind
      position
      refreshOnUpdate
      refreshOptionsOnUpdate
      options {
        accessibilityLabel
        configuration
        icon
        label
        value
        __typename
      }
    }
    ... on ProductFilterPillConfiguration {
      __typename
      title
      icon
      screenTitle
      filterKind
      position
      options {
        accessibilityLabel
        configuration
        icon
        label
        value
        __typename
      }
    }
    ... on ProductFilterChipConfiguration {
      __typename
      title
      icon
      screenTitle
      filterKind
      position
      options {
        accessibilityLabel
        configuration
        icon
        label
        value
        __typename
      }
    }
  }
  __typename
}

fragment ProductCard on DiscoveryProduct {
  ...ProductCardWithoutShopCash
  shopCashIncentive {
    ...ShopCashIncentiveFragment
    __typename
  }
  __typename
}

fragment ProductCardWithoutShopCash on DiscoveryProduct {
  id
  title
  numberOfVariants
  inDefaultProductList
  isProductDiscoveryEligible
  isRestricted
  defaultVariantId
  referral
  shareUrl
  offers {
    id
    ... on AutomaticDiscount {
      ...AutomaticDiscount
      __typename
    }
    __typename
  }
  price {
    amount
    currencyCode
    __typename
  }
  originalPrice {
    amount
    currencyCode
    __typename
  }
  url
  images {
    ...ReducedImage
    __typename
  }
  reviewAnalytics {
    averageRating
    count
    __typename
  }
  shop {
    id
    uuid
    name
    nativeProductPagesEnabled
    shopifyId
    followedByMe
    websiteUrl
    storeEligible
    inAppVisibilityStatus
    referral
    featuredIn {
      handle
      __typename
    }
    visualTheme {
      id
      logoImage {
        ...ReducedImage
        __typename
      }
      featuredImages {
        ...ReducedImage
        __typename
      }
      __typename
    }
    __typename
  }
  __typename
}

fragment ShopCashIncentiveFragment on ShopCashIncentive {
  ... on ShopCashOffer {
    id
    minimumOrderValue {
      ...MoneyV2Fragment
      __typename
    }
    totalCashDestinationAmount {
      ...MoneyV2Fragment
      __typename
    }
    adMetadata {
      ...AdMetadata
      __typename
    }
    __typename
  }
  ... on ShopCashCashbackIncentive {
    maxApplicableOrderAmount {
      ...MoneyV2Fragment
      __typename
    }
    ratePercentage
    __typename
  }
  ... on FlatAmountCashbackOffer {
    adMetadata {
      ...AdMetadata
      __typename
    }
    cashbackAmount {
      ...MoneyV2Fragment
      __typename
    }
    minimumOrderValue {
      ...MoneyV2Fragment
      __typename
    }
    __typename
  }
  __typename
}

fragment AutomaticDiscount on AutomaticDiscount {
  id
  constraints {
    text
    type
    __typename
  }
  description
  shortDescription
  discountAmount {
    ...MoneyV2Fragment
    __typename
  }
  discountClass
  discountPercentage
  discountType
  minimumRequirementAmount {
    ...MoneyV2Fragment
    __typename
  }
  minimumRequirementQuantity
  minimumRequirementType
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

fragment MoneyV2Fragment on MoneyV2 {
  amount
  currencyCode
  __typename
}

fragment AdMetadata on ShopAdMetadata {
  id
  adResponseId
  adType
  campaignCountryCode
  campaignHandle
  __typename
}
`;
