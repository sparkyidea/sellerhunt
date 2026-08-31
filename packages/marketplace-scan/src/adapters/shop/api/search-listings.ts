/**
 * Keyword → page of listing refs + shop refs, via shop.app's
 * `SearchProductsModular` GraphQL operation against `server.shop.app/graphql`.
 *
 * This is the iOS app's search-results-page query. Unlike `getSellerListings`,
 * the response is a heterogeneous "modular" feed — each `node` carries a
 * `__typename` discriminator and the parser walks them to extract products
 * and shops:
 *   - `ProductSearchModuleProductList`            → products[]
 *   - `ProductSearchModuleUniversalProductList`   → products[].highlightedProduct + products[].shops[]
 *   - `ProductSearchModuleProductRail`            → products[].product (wrapped in ShoppingFeedProductCard)
 *   - `ProductSearchModuleMerchantCard`           → shop
 *   - `ProductSearchModuleMerchantList`           → shops[]
 *   - `ProductSearchModuleResultCount`            → totalCount
 *
 * Listings are deduped by `listingId`; shops are deduped by GraphQL node `id`.
 * The `shops` field on the result is the union from product-embedded shops
 * AND merchant-card modules — useful for seller-discovery callers, since
 * merchant modules often surface shops that have no product hits on the page.
 *
 * Pagination: Relay-style opaque `endCursor` (round-trip until `hasNextPage`
 * is false). `sessionId` is part of the GraphQL variables (not just headers)
 * — passing the same id across pages stitches user-flow analytics on
 * shop.app's side; the parser echoes the id used so callers can reuse it.
 *
 * Same caveats as the rest of `marketplace-scan`: not a documented API,
 * GraphQL shape can change without notice, bearer-token auth is unofficial.
 */
import { ScanRequestError } from "../../../errors";

const GRAPHQL_ENDPOINT = "https://server.shop.app/graphql";

const SHOP_USER_AGENT = "Shop/2.250.1-release.289403 ios/16.3";
const SHOP_MINIS_PLATFORM_VERSION = "0.15.0";

/** Default page size. shop.app's PLP gateway caps at 30; same conservative
 *  cap applied here pending independent verification on this operation. */
const DEFAULT_FIRST = 30;
const MAX_FIRST = 30;

/** Neutral filter set captured from the iOS app — all toggles off, sort by
 *  relevance, ship-to using the persona's default locale. Mirrors the "no
 *  user customization" search state. */
const DEFAULT_FILTERS: SearchProductsFilter[] = [
  { key: "inStock", value: false },
  { key: "onSale", value: false },
  { key: "price", value: {} },
  { key: "shipsFrom", value: false },
  { key: "shipsTo", value: { useDefault: true } },
  { key: "shopCashOffer", value: false },
  { key: "sortBy", value: "relevance" },
];

/** `gid://shop-app/Shop/<numeric>` — used to extract the numeric seller id
 *  consumed by `getSeller` and `getSellerListings`. shop.app's responses
 *  return the id sometimes in this gid form, sometimes as bare numeric;
 *  `parseSellerId` below handles both. */
const SHOP_GID_RE = /^gid:\/\/shop-app\/Shop\/(\d+)$/;
const BARE_NUMERIC_RE = /^\d+$/;

export interface SearchProductsFilter {
  key: string;
  /**
   * Filter value. shop.app accepts heterogeneous shapes: boolean for toggles
   * (`inStock`), string for enums (`sortBy: "relevance"`), nested object for
   * structured filters (`shipsTo: {useDefault: true}`, `price: {}`). Typed
   * as `unknown` so callers aren't constrained by what we've seen so far.
   */
  value?: unknown;
}

export interface SearchListingsOptions {
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
   * Override the captured filter set. Defaults to the neutral state (all
   * toggles off, sortBy=relevance). Pass `[]` to disable filtering entirely.
   */
  filters?: SearchProductsFilter[];
  /** Page size. Defaults to 30. shop.app caps PLP at 30 server-side. */
  first?: number;
  /**
   * Search keyword(s), e.g. `"nintendo switch 2"`. Same shape as the eBay
   * adapter's `searchListings({ keyword })` so callers can stay
   * marketplace-agnostic. shop.app's GraphQL takes this as the `query`
   * variable on the wire (string passed verbatim — no client-side query
   * construction); the wire-layer name is preserved inside the request
   * body only.
   */
  keyword: string;
  /**
   * Search session id passed as a GraphQL variable (NOT the `session-id`
   * header — that's separately generated per request). Reuse across pages to
   * stitch session analytics on shop.app's side. Defaults to a fresh UUID
   * per call (each call is a new session).
   */
  sessionId?: string;
}

export interface SearchListingsResult {
  /** True when `pageInfo.hasNextPage` is true — feed `nextCursor` back to fetch the next page. */
  hasMore: boolean;
  /**
   * Listings extracted from product-bearing modules, in display order, deduped
   * by `listingId`. Each ref carries the embedded shop parsed from the
   * product card's `shop` block (use `listing.shop?.sellerId` for seller
   * discovery).
   */
  listings: ShopSearchListingRef[];
  /** Cursor for the next page, or null when there are no more results. */
  nextCursor: string | null;
  /** Raw GraphQL response. Use for shape-drift inspection. */
  raw: ShopSearchProductsModularResponse;
  /**
   * Echo of the sessionId used in this request (the one passed in
   * `options.sessionId`, or a fresh UUID generated on the caller's behalf).
   * Pass back as `sessionId` on subsequent pages to stitch session analytics.
   */
  sessionId: string;
  /**
   * Unique shops surfaced on this page — union of product-embedded shops
   * (from product modules) and merchant-only modules (`MerchantCard`,
   * `MerchantList`, `UniversalProductList.products[].shops`). Deduped by
   * GraphQL node `id`. Useful for the scanner's seller-discovery path,
   * since merchant modules often expose shops that have no product hits.
   */
  shops: ShopSearchListingShop[];
  /**
   * Total products matching the query — sourced from the
   * `ProductSearchModuleResultCount` module. Null when the response omitted
   * that module (typical for empty / auto-corrected queries).
   */
  totalCount: number | null;
}

/**
 * Lightweight listing identifier + display fields available on the search
 * results page. Matches the `ShopListingRef` shape from `getSellerListings`
 * for parser symmetry, plus an embedded `shop` block — search results are
 * cross-shop, so each listing's shop matters more than in seller-listings
 * (where the shop is fixed for the whole page).
 */
export interface ShopSearchListingRef {
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
  /** Shop info parsed from the product card's embedded `shop` block. */
  shop: ShopSearchListingShop | null;
  /** Listing title. */
  title: string;
}

export interface ShopSearchListingShop {
  /** True when the calling persona currently follows this shop. */
  followedByMe: boolean | null;
  /** GraphQL node id (e.g. `gid://shop-app/Shop/165053`). */
  id: string | null;
  /** Shop logo URL, when available. */
  logoUrl: string | null;
  /** Shop display name. */
  name: string | null;
  /**
   * Numeric shop.app shop identifier extracted from `id` — the bare
   * numeric form, regardless of whether the response carried it as a gid
   * (`gid://shop-app/Shop/165053`) or as a plain string (`"165053"`). Reuse
   * as `sellerId` in subsequent calls (`getSeller`, `getSellerListings`).
   * Null when `id` is missing or doesn't match either expected shape.
   */
  sellerId: string | null;
  /** Shopify GID for the shop (e.g. `gid://shopify/Shop/123`). */
  shopifyId: string | null;
  /** True when the shop is eligible for shop.app store features. */
  storeEligible: boolean | null;
  /** shop.app shop UUID. */
  uuid: string | null;
  /** Merchant's primary website URL. */
  websiteUrl: string | null;
}

export async function searchListings(
  options: SearchListingsOptions
): Promise<SearchListingsResult> {
  const headerSessionId = crypto.randomUUID();
  const requestedFirst = options.first ?? DEFAULT_FIRST;
  const first = Math.min(requestedFirst, MAX_FIRST);
  const filters = options.filters ?? DEFAULT_FILTERS;
  const variableSessionId = options.sessionId ?? crypto.randomUUID();

  const variables: Record<string, unknown> = {
    first,
    // shop.app's GraphQL `query: String` variable takes the keyword string
    // verbatim — the option/echo name exposed to callers is `keyword`.
    query: options.keyword,
    filters,
    sessionId: variableSessionId,
  };
  if (options.cursor) {
    variables.after = options.cursor;
  }

  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "*/*",
      "Accept-Language": "en",
      Authorization: `Bearer ${options.authToken}`,
      "Content-Type": "application/json",
      "User-Agent": SHOP_USER_AGENT,
      "session-id": headerSessionId,
      "x-device-id": options.deviceId,
      "x-device-id-hw": options.deviceIdHw,
      "x-device-name": options.deviceName,
      "x-feature-overrides": "",
      "x-features": "",
      "x-preview-overrides": "null",
      "x-shop-minis-platform-versions": SHOP_MINIS_PLATFORM_VERSION,
    },
    body: JSON.stringify({
      operationName: "SearchProductsModular",
      variables,
      query: SEARCH_PRODUCTS_MODULAR_QUERY,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new ScanRequestError({
      endpoint: "shop.search-listings",
      message: `shop.app monitor search-listings failed (${response.status}): ${errorText.slice(0, 500)}`,
      status: response.status,
      body: errorText.slice(0, 500),
    });
  }

  const raw = (await response.json()) as ShopSearchProductsModularResponse;

  // GraphQL-layer errors return HTTP 200 with a populated `errors[]`. Surface
  // them as 400 so callers see structural failures distinctly from 401/5xx.
  if (Array.isArray(raw.errors) && raw.errors.length > 0) {
    const message = raw.errors[0]?.message ?? "shop.app GraphQL error";
    throw new ScanRequestError({
      endpoint: "shop.search-listings",
      message: `shop.app monitor search-listings GraphQL error: ${message}`,
      status: 400,
      body: JSON.stringify(raw.errors).slice(0, 500),
    });
  }

  const connection = raw.data?.productSearchModular ?? null;
  const nodes = connection?.nodes ?? [];
  const { listings, shops, totalCount } = walkModules(nodes);
  const pageInfo = connection?.pageInfo ?? null;
  const hasMore = pageInfo?.hasNextPage === true;
  const nextCursor =
    hasMore && typeof pageInfo?.endCursor === "string"
      ? pageInfo.endCursor
      : null;

  return {
    hasMore,
    listings,
    nextCursor,
    raw,
    sessionId: variableSessionId,
    shops,
    totalCount,
  };
}

// ===========================================================================
// Internals: parsing
// ===========================================================================

interface WalkResult {
  listings: ShopSearchListingRef[];
  shops: ShopSearchListingShop[];
  totalCount: number | null;
}

function walkModules(nodes: unknown[]): WalkResult {
  const listingsById = new Map<string, ShopSearchListingRef>();
  const shopsById = new Map<string, ShopSearchListingShop>();
  let totalCount: number | null = null;

  for (const rawNode of nodes) {
    const node = narrowModule(rawNode);
    if (!node) {
      // Other module types (RelatedSearches, QualitySurvey, EmptyResult,
      // SoftAutoCorrection, etc.) carry no product/shop data we need.
      continue;
    }
    const found = handleModule(node, listingsById, shopsById);
    if (found !== null) {
      totalCount = found;
    }
  }

  return {
    listings: [...listingsById.values()],
    shops: [...shopsById.values()],
    totalCount,
  };
}

/**
 * Apply a single module's contributions to the listing/shop dedupe maps.
 * Returns the totalCount it surfaced (only ResultCount carries one), or null
 * for variants that don't contribute a count.
 */
function handleModule(
  node: SearchModuleNode,
  listingsById: Map<string, ShopSearchListingRef>,
  shopsById: Map<string, ShopSearchListingShop>
): number | null {
  switch (node.__typename) {
    case "ProductSearchModuleProductList":
      for (const product of node.products ?? []) {
        collectProduct(product, listingsById, shopsById);
      }
      return null;
    case "ProductSearchModuleUniversalProductList":
      for (const universal of node.products ?? []) {
        collectProduct(universal?.highlightedProduct, listingsById, shopsById);
        for (const shop of universal?.shops ?? []) {
          collectShop(shop, shopsById);
        }
      }
      return null;
    case "ProductSearchModuleProductRail":
      for (const wrapper of node.products ?? []) {
        collectProduct(wrapper?.product, listingsById, shopsById);
      }
      return null;
    case "ProductSearchModuleMerchantCard":
      collectShop(node.shop, shopsById);
      return null;
    case "ProductSearchModuleMerchantList":
      for (const shop of node.shops ?? []) {
        collectShop(shop, shopsById);
      }
      return null;
    default:
      return typeof node.totalCount === "number" ? node.totalCount : null;
  }
}

/**
 * Narrow a JSON-decoded node to one of the module variants we read. Returns
 * null for nulls, non-objects, missing `__typename`, or any module type
 * outside our extraction set.
 */
function narrowModule(raw: unknown): SearchModuleNode | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const typename = (raw as { __typename?: unknown }).__typename;
  if (typeof typename !== "string") {
    return null;
  }
  switch (typename) {
    case "ProductSearchModuleProductList":
    case "ProductSearchModuleUniversalProductList":
    case "ProductSearchModuleProductRail":
    case "ProductSearchModuleMerchantCard":
    case "ProductSearchModuleMerchantList":
    case "ProductSearchModuleResultCount":
      return raw as SearchModuleNode;
    default:
      return null;
  }
}

function collectProduct(
  product: SearchProduct | null | undefined,
  listingsById: Map<string, ShopSearchListingRef>,
  shopsById: Map<string, ShopSearchListingShop>
): void {
  if (!product) {
    return;
  }
  const id = product.id;
  if (typeof id !== "string" || id.length === 0) {
    return;
  }
  if (!listingsById.has(id)) {
    listingsById.set(id, toListingRef(product, id));
  }
  // Always collect the shop, even if the listing was a duplicate — different
  // modules can carry the same listing with different shop metadata
  // populated, and we want the most complete shop ref in the dedupe map.
  collectShop(product.shop, shopsById);
}

function collectShop(
  shop: SearchShop | null | undefined,
  shopsById: Map<string, ShopSearchListingShop>
): void {
  if (!shop || typeof shop.id !== "string" || shop.id.length === 0) {
    return;
  }
  if (shopsById.has(shop.id)) {
    return;
  }
  shopsById.set(shop.id, toShopRef(shop));
}

function toListingRef(p: SearchProduct, id: string): ShopSearchListingRef {
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
    shop: p.shop ? toShopRef(p.shop) : null,
    title: p.title ?? "",
  };
}

function toShopRef(shop: SearchShop): ShopSearchListingShop {
  return {
    sellerId: parseSellerId(shop.id),
    followedByMe:
      typeof shop.followedByMe === "boolean" ? shop.followedByMe : null,
    id: shop.id ?? null,
    logoUrl: shop.visualTheme?.logoImage?.url ?? null,
    name: shop.name ?? null,
    shopifyId: shop.shopifyId ?? null,
    storeEligible:
      typeof shop.storeEligible === "boolean" ? shop.storeEligible : null,
    uuid: shop.uuid ?? null,
    websiteUrl: shop.websiteUrl ?? null,
  };
}

/**
 * Extract the bare numeric shop id from shop.app's `Shop.id` field, which
 * appears in two shapes across responses:
 *   - `gid://shop-app/Shop/165053` (StoreMeta / some search-result paths)
 *   - `"165053"` (the search-result `products[].shops[].id` we typically see)
 * Returns null if the value matches neither shape.
 */
function parseSellerId(id: string | null | undefined): string | null {
  if (typeof id !== "string") {
    return null;
  }
  const gidMatch = SHOP_GID_RE.exec(id);
  if (gidMatch) {
    return gidMatch[1] ?? null;
  }
  if (BARE_NUMERIC_RE.test(id)) {
    return id;
  }
  return null;
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
// Hand-typed from the operation in the captured curl. Only the fields the
// parser reads are typed; everything else is left open via `Record<string,
// unknown>` on parents so shape drift surfaces at the extraction sites
// rather than deep in the type tree.
// ===========================================================================

export interface ShopSearchProductsModularResponse {
  data?: {
    productSearchModular?: {
      /**
       * Heterogeneous module nodes — each carries a `__typename` discriminator.
       * Typed as `unknown[]` because the variants we don't read shouldn't
       * leak into the parser's type surface; `narrowModule` re-types each
       * entry to `SearchModuleNode` for the variants we extract from.
       */
      nodes?: unknown[];
      pageInfo?: {
        endCursor?: string | null;
        hasNextPage?: boolean;
      };
      sessionId?: string | null;
    } | null;
  };
  errors?: Array<{ message?: string }>;
}

/** Discriminated union over the module variants the parser reads. */
type SearchModuleNode =
  | ProductListModule
  | UniversalProductListModule
  | ProductRailModule
  | MerchantCardModule
  | MerchantListModule
  | ResultCountModule;

interface ProductListModule {
  __typename: "ProductSearchModuleProductList";
  products?: Array<SearchProduct | null>;
}

interface UniversalProductListModule {
  __typename: "ProductSearchModuleUniversalProductList";
  products?: Array<UniversalEntry | null>;
}

interface ProductRailModule {
  __typename: "ProductSearchModuleProductRail";
  products?: Array<RailWrapper | null>;
}

interface MerchantCardModule {
  __typename: "ProductSearchModuleMerchantCard";
  shop?: SearchShop | null;
}

interface MerchantListModule {
  __typename: "ProductSearchModuleMerchantList";
  shops?: Array<SearchShop | null>;
}

interface ResultCountModule {
  __typename: "ProductSearchModuleResultCount";
  totalCount?: number | null;
}

interface UniversalEntry {
  highlightedProduct?: SearchProduct | null;
  shops?: Array<SearchShop | null>;
}

interface RailWrapper {
  product?: SearchProduct | null;
}

interface SearchProduct {
  id?: string;
  images?: Array<{ url?: string }>;
  numberOfVariants?: number;
  originalPrice?: SearchMoney | null;
  price?: SearchMoney | null;
  reviewAnalytics?: { averageRating?: number; count?: number };
  shareUrl?: string;
  shop?: SearchShop | null;
  title?: string;
  url?: string;
}

interface SearchShop {
  followedByMe?: boolean | null;
  id?: string;
  name?: string;
  shopifyId?: string | null;
  storeEligible?: boolean | null;
  uuid?: string;
  visualTheme?: {
    logoImage?: { url?: string } | null;
  } | null;
  websiteUrl?: string | null;
}

interface SearchMoney {
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

const SEARCH_PRODUCTS_MODULAR_QUERY = `query SearchProductsModular($first: Int!, $after: String, $filters: [SearchFilterV2!], $query: String, $similarTo: [ID!], $sessionId: ID, $categoryBrowseId: ID, $adToken: String) {
  productSearchModular(
    first: $first
    after: $after
    filters: $filters
    query: $query
    similarTo: $similarTo
    sessionId: $sessionId
    categoryBrowseId: $categoryBrowseId
    adToken: $adToken
  ) {
    ... on ProductSearchModuleConnection {
      nodes {
        ...ProductSearchModuleActionTrain
        ...ProductSearchModuleMerchantCard
        ...ProductSearchModuleMerchantList
        ...ProductSearchModuleProductList
        ...ProductSearchModuleUniversalProductList
        ...ProductSearchModuleQualitySurvey
        ...ProductSearchModuleRelatedSearches
        ...ProductSearchModuleResultCount
        ...ProductSearchModuleSearchTermList
        ...ProductSearchModuleTrackingCTA
        ...ProductSearchModuleEmptyResult
        ...ProductSearchModuleProductRail
        ...ProductSearchModuleSoftAutoCorrection
        ...ProductSearchModuleHardAutoCorrection
        __typename
      }
      inferredCategoryFilters
      pageInfo {
        endCursor
        hasNextPage
        __typename
      }
      productFilters {
        ...ProductFilter
        __typename
      }
      sessionId
      __typename
    }
    __typename
  }
}

fragment ProductSearchModuleActionTrain on ProductSearchModuleActionTrain {
  gid {
    modelId
    __typename
  }
  id
  title
  items {
    __typename
    ... on ProductFilter {
      ...ProductFilter
      __typename
    }
    ... on ProductSearchModuleActionTrainButton {
      action {
        label
        url
        __typename
      }
      __typename
    }
  }
  __typename
}

fragment ProductSearchModuleMerchantCard on ProductSearchModuleMerchantCard {
  gid {
    modelId
    __typename
  }
  shop {
    ...Shop
    __typename
  }
  __typename
}

fragment ProductSearchModuleMerchantList on ProductSearchModuleMerchantList {
  title
  gid {
    modelId
    __typename
  }
  shops {
    ...Shop
    __typename
  }
  __typename
}

fragment ProductSearchModuleProductList on ProductSearchModuleProductList {
  gid {
    modelId
    __typename
  }
  products {
    id
    ...ProductDetailsProduct
    __typename
  }
  title
  productPreviewType
  action {
    url
    label
    __typename
  }
  __typename
}

fragment ProductSearchModuleUniversalProductList on ProductSearchModuleUniversalProductList {
  gid {
    modelId
    __typename
  }
  products {
    id
    shopCount
    clusterProductIds
    priceRange {
      minAmount {
        ...MoneyV2Fragment
        __typename
      }
      maxAmount {
        ...MoneyV2Fragment
        __typename
      }
      __typename
    }
    shops {
      id
      ...Shop
      shopCashIncentive {
        ...ShopCashIncentiveFragment
        __typename
      }
      __typename
    }
    highlightedProduct {
      id
      ...ProductDetailsProduct
      __typename
    }
    __typename
  }
  __typename
}

fragment ProductSearchModuleQualitySurvey on ProductSearchModuleQualitySurvey {
  gid {
    modelId
    __typename
  }
  title
  secondaryOptions {
    id
    responseType
    label
    __typename
  }
  __typename
}

fragment ProductSearchModuleRelatedSearches on ProductSearchModuleRelatedSearches {
  gid {
    modelId
    __typename
  }
  title
  matchedTerm
  suggestions {
    id
    generatedBy
    term
    __typename
  }
  __typename
}

fragment ProductSearchModuleResultCount on ProductSearchModuleResultCount {
  gid {
    modelId
    __typename
  }
  totalCount
  id
  __typename
}

fragment ProductSearchModuleSearchTermList on ProductSearchModuleSearchTermList {
  gid {
    modelId
    __typename
  }
  title
  brokerId
  specialCase
  items {
    ... on SearchTerm {
      id
      term
      __typename
    }
    ... on TermListCollection {
      id
      title
      image {
        ...ReducedImage
        __typename
      }
      __typename
    }
    ... on TermListProduct {
      product {
        id
        shopifyId
        ...ProductCard
        __typename
      }
      __typename
    }
    __typename
  }
  __typename
}

fragment ProductSearchModuleTrackingCTA on ProductSearchModuleTrackingCTA {
  gid {
    modelId
    __typename
  }
  id
  __typename
}

fragment ProductSearchModuleEmptyResult on ProductSearchModuleEmptyResult {
  gid {
    modelId
    __typename
  }
  id
  __typename
}

fragment ProductSearchModuleProductRail on ProductSearchModuleProductRail {
  gid {
    modelId
    __typename
  }
  id
  title
  products {
    ... on ShoppingFeedContentItem {
      ... on ShoppingFeedProductCard {
        id
        secondaryAction {
          icon
          label
          __typename
        }
        product {
          id
          ...ProductCard
          __typename
        }
        __typename
      }
      __typename
    }
    __typename
  }
  action {
    label
    url
    __typename
  }
  __typename
}

fragment ProductSearchModuleSoftAutoCorrection on ProductSearchModuleSoftAutoCorrection {
  gid {
    modelId
    __typename
  }
  id
  suggestedQuery
  __typename
}

fragment ProductSearchModuleHardAutoCorrection on ProductSearchModuleHardAutoCorrection {
  gid {
    modelId
    __typename
  }
  id
  suggestedQuery
  originalQuery
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

fragment Shop on Shop {
  id
  uuid
  shopifyId
  followedByMe
  name
  nativeProductPagesEnabled
  storeEligible
  productReviewAnalytics {
    averageRating
    totalProductReviews
    totalProductRatings
    __typename
  }
  visualTheme {
    ...VisualTheme
    __typename
  }
  featuredIn {
    handle
    __typename
  }
  websiteUrl
  shareUrl
  referral
  offers {
    ... on AutomaticDiscount {
      id
      __typename
    }
    __typename
  }
  shopCashIncentive {
    ...ShopCashIncentiveFragment
    __typename
  }
  inAppVisibilityStatus
  __typename
}

fragment ProductDetailsProduct on DiscoveryProduct {
  ...ProductCard
  shop {
    id
    uuid
    name
    nativeProductPagesEnabled
    productReviewAnalytics {
      averageRating
      totalProductRatings
      totalProductReviews
      __typename
    }
    shopifyId
    followedByMe
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

fragment MoneyV2Fragment on MoneyV2 {
  amount
  currencyCode
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

fragment ReducedImage on Image {
  url
  altText
  height
  width
  sensitive
  thumbhash
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

fragment AdMetadata on ShopAdMetadata {
  id
  adResponseId
  adType
  campaignCountryCode
  campaignHandle
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
`;
