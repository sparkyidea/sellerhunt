/**
 * Product id → unified `ScanListing`, via shop.app's `ProductDetailsQuery` +
 * iterative `AdjacentVariantsQuery`.
 *
 * Shop.app's product-detail endpoint only returns
 * `selectedOrFirstAvailableVariant` — one variant. To enumerate the full
 * variant set (needed to populate `scan_listing_variant`), this orchestrator
 * also calls `getAdjacentVariants` once per discovered variant until the set
 * stabilizes (or hits the iteration cap).
 *
 * Shape returned is the unified `ScanListing` so callers don't need to know
 * which marketplace produced it. The marketplace-specific parsed shape is
 * kept INTERNAL (`ParsedProduct`) and only flows into the mapper.
 *
 * Same caveats as the rest of `marketplace-scan`: not a documented API,
 * GraphQL shape can change without notice, bearer-token auth is unofficial.
 */
import { convert } from "html-to-text";
import type { ScanListing } from "../../../types";
import { shopGraphqlFetch } from "../http";
import {
  type GetAdjacentVariantsResult,
  getAdjacentVariants,
  type ParsedVariant,
  parseVariant as parseShopVariant,
  type ShopAdjacentVariantNode,
  type ShopVariantOption,
} from "./get-adjacent-variants";
import {
  mapListing,
  type ParsedProduct,
  type ParsedProductShop,
} from "./mapper/map-listing";

const DEFAULT_IMAGE_WIDTH = 1242;

/**
 * Cap on AdjacentVariantsQuery iterations. Single-axis products converge in
 * one call; multi-axis products may need more because shop.app's adjacency
 * is undocumented and may only return one-option-different siblings per
 * call. Hitting the cap with the set still growing emits a console.warn
 * with the listingId — surface as a follow-up if it ever fires.
 */
const MAX_ADJACENT_ITERATIONS = 4;

export interface GetListingOptions {
  /** Bearer token minted via `getAuthToken`. */
  authToken: string;
  /** Per-install UUID matching the persona that minted the bearer. */
  deviceId: string;
  /** Hardware UUID matching the persona that minted the bearer. */
  deviceIdHw: string;
  /** Display name matching the persona that minted the bearer. */
  deviceName: string;
  /** Image max width in pixels. Defaults to 1242 (iPhone XR captured value). */
  imageWidth?: number;
  /**
   * Shopify product id (bare numeric, no `gid://` prefix — e.g.
   * `"8404160315548"`). shop.app's GraphQL refers to this as `productId`
   * on the wire; we expose `listingId` to match the rest of the scan API
   * surface and `ScanGetListingOptions.listingId`.
   */
  listingId: string;
}

export interface GetListingResult {
  /** Form for `scan_listing` (+ nested variant children). */
  listing: ScanListing;
  /** Echoed for convenience. */
  listingId: string;
  /** Raw responses, for shape-drift inspection. `adjacentPages` is omitted when no adjacency calls were needed. */
  raw: {
    adjacentPages?: GetAdjacentVariantsResult["raw"][];
    product: ShopProductDetailsResponse;
  };
}

export async function getListing(
  options: GetListingOptions
): Promise<GetListingResult> {
  const imageWidth = options.imageWidth ?? DEFAULT_IMAGE_WIDTH;

  const productRaw = await shopGraphqlFetch<ShopProductDetailsResponse>({
    endpoint: "shop.get-listing",
    operationName: "ProductDetailsQuery",
    variables: {
      imageWidth,
      // `productId` is shop.app's GraphQL field; the option/echo name
      // exposed externally is `listingId` for cross-adapter parity.
      productInput: { productId: options.listingId },
    },
    query: PRODUCT_DETAILS_QUERY,
    headers: {
      Authorization: `Bearer ${options.authToken}`,
      "x-device-id": options.deviceId,
      "x-device-id-hw": options.deviceIdHw,
      "x-device-name": options.deviceName,
    },
  });

  const parsedProduct = parseProduct(productRaw);
  const firstVariant = extractFirstVariant(productRaw);

  const { variants, adjacentPages } = await collectAllVariants({
    authToken: options.authToken,
    deviceId: options.deviceId,
    deviceIdHw: options.deviceIdHw,
    deviceName: options.deviceName,
    firstVariant,
    imageWidth,
    listingId: options.listingId,
    variantsCount: parsedProduct.variantsCount,
  });

  const listing = mapListing({
    listingId: options.listingId,
    product: parsedProduct,
    variants,
  });

  return {
    listing,
    listingId: options.listingId,
    raw: {
      product: productRaw,
      ...(adjacentPages.length > 0 ? { adjacentPages } : {}),
    },
  };
}

// ===========================================================================
// Internals: orchestration
// ===========================================================================

interface CollectVariantsInput {
  authToken: string;
  deviceId: string;
  deviceIdHw: string;
  deviceName: string;
  firstVariant: ParsedVariant | null;
  imageWidth: number;
  listingId: string;
  variantsCount: number | null;
}

interface CollectVariantsResult {
  adjacentPages: GetAdjacentVariantsResult["raw"][];
  variants: ParsedVariant[];
}

/**
 * Fan out via `AdjacentVariantsQuery` until the variant set stabilizes or
 * the iteration cap is reached. Single-axis products converge in 1 call;
 * multi-axis may need more because adjacency semantics are undocumented.
 */
async function collectAllVariants(
  input: CollectVariantsInput
): Promise<CollectVariantsResult> {
  const knownById = new Map<string, ParsedVariant>();
  const adjacentPages: GetAdjacentVariantsResult["raw"][] = [];

  if (input.firstVariant) {
    knownById.set(input.firstVariant.id, input.firstVariant);
  }

  // Single-variant products (or no variant info) skip adjacency entirely.
  const expectedCount = input.variantsCount ?? 0;
  if (expectedCount <= 1) {
    return { variants: [...knownById.values()], adjacentPages };
  }

  // Queue of selectedOptions to query for siblings. Track which option-sets
  // we've already used as the seed so we don't re-query the same vertex.
  const queriedSets = new Set<string>();
  let queue: ShopVariantOption[][] = [];
  if (input.firstVariant && input.firstVariant.selectedOptions.length > 0) {
    queue.push(input.firstVariant.selectedOptions);
  }

  for (let iteration = 0; iteration < MAX_ADJACENT_ITERATIONS; iteration += 1) {
    if (queue.length === 0) {
      break;
    }
    const sizeBefore = knownById.size;
    const nextQueue = await runAdjacencyIteration({
      input,
      knownById,
      adjacentPages,
      queriedSets,
      queue,
    });

    if (knownById.size === sizeBefore) {
      break;
    }
    if (knownById.size >= expectedCount) {
      break;
    }
    queue = nextQueue;
  }

  if (knownById.size < expectedCount) {
    warnIncompleteAdjacency(input.listingId, expectedCount, knownById.size);
  }

  return { variants: [...knownById.values()], adjacentPages };
}

interface IterationContext {
  adjacentPages: GetAdjacentVariantsResult["raw"][];
  input: CollectVariantsInput;
  knownById: Map<string, ParsedVariant>;
  queriedSets: Set<string>;
  queue: ShopVariantOption[][];
}

/**
 * One round of fan-out: for each seed options-set in `queue`, fire one
 * AdjacentVariantsQuery, merge new variants into `knownById`, and collect
 * their selectedOptions for the next iteration. Mutates the maps/sets.
 */
async function runAdjacencyIteration(
  ctx: IterationContext
): Promise<ShopVariantOption[][]> {
  const nextQueue: ShopVariantOption[][] = [];
  for (const seedOptions of ctx.queue) {
    const key = optionsKey(seedOptions);
    if (ctx.queriedSets.has(key)) {
      continue;
    }
    ctx.queriedSets.add(key);

    const result = await getAdjacentVariants({
      authToken: ctx.input.authToken,
      deviceId: ctx.input.deviceId,
      deviceIdHw: ctx.input.deviceIdHw,
      deviceName: ctx.input.deviceName,
      imageWidth: ctx.input.imageWidth,
      listingId: ctx.input.listingId,
      selectedOptions: seedOptions,
    });
    ctx.adjacentPages.push(result.raw);
    mergeNewVariants(result.adjacentVariants, ctx.knownById, nextQueue);
  }
  return nextQueue;
}

function mergeNewVariants(
  found: ParsedVariant[],
  knownById: Map<string, ParsedVariant>,
  nextQueue: ShopVariantOption[][]
): void {
  for (const v of found) {
    if (knownById.has(v.id)) {
      continue;
    }
    knownById.set(v.id, v);
    if (v.selectedOptions.length > 0) {
      nextQueue.push(v.selectedOptions);
    }
  }
}

function warnIncompleteAdjacency(
  listingId: string,
  expected: number,
  got: number
): void {
  console.warn(
    `[shop.get-listing] adjacency incomplete: listingId=${listingId} expected=${expected} got=${got} iterations=${MAX_ADJACENT_ITERATIONS}`
  );
}

function optionsKey(options: ShopVariantOption[]): string {
  return options
    .map((o) => `${o.name}=${o.value}`)
    .sort()
    .join(" ");
}

// ===========================================================================
// Internals: parsing
// ===========================================================================

function parseProduct(raw: ShopProductDetailsResponse): ParsedProduct {
  const product = raw.data?.storefrontProduct;
  if (!product) {
    return emptyProduct();
  }
  return {
    description: extractDescription(
      product.descriptionHtml ?? product.description ?? null
    ),
    imageUrls: extractImageUrls(product.media?.nodes),
    onlineStoreUrl: product.onlineStoreUrl ?? null,
    soldLast30Days:
      typeof product.salesData?.approximateQuantitySoldLast30Days === "number"
        ? product.salesData.approximateQuantitySoldLast30Days
        : null,
    shop: product.shop ? extractShop(product.shop) : null,
    title: product.title ?? null,
    variantsCount:
      typeof product.variantsCount?.count === "number"
        ? product.variantsCount.count
        : null,
  };
}

function emptyProduct(): ParsedProduct {
  return {
    description: null,
    imageUrls: [],
    onlineStoreUrl: null,
    shop: null,
    soldLast30Days: null,
    title: null,
    variantsCount: null,
  };
}

function extractFirstVariant(
  raw: ShopProductDetailsResponse
): ParsedVariant | null {
  const v = raw.data?.storefrontProduct?.selectedOrFirstAvailableVariant;
  if (!v?.id) {
    return null;
  }
  return parseShopVariant(v as ShopAdjacentVariantNode);
}

function extractShop(shop: ShopShop): ParsedProductShop {
  return {
    // shop.app's `Shop.id` is the bare numeric seller id (the same value
    // its GraphQL calls `brokerId` in variables). The wire name stays
    // inside `getSeller`/`getSellerListings`; the parsed shape uses
    // `sellerId` to match the rest of the scan API surface.
    sellerId:
      typeof shop.id === "string" && shop.id.length > 0 ? shop.id : null,
    logoUrl: shop.visualTheme?.logoImage?.url ?? null,
    name: shop.name ?? null,
    shopifyId: shop.shopifyId ?? null,
    uuid: shop.uuid ?? null,
    websiteUrl: shop.websiteUrl ?? null,
  };
}

function extractDescription(html: string | null | undefined): string | null {
  if (!html) {
    return null;
  }
  const text = convert(html).trim();
  return text.length > 0 ? text : null;
}

function extractImageUrls(nodes: ShopMediaNode[] | undefined): string[] {
  if (!nodes) {
    return [];
  }
  const urls: string[] = [];
  for (const node of nodes) {
    const url = node.image?.url;
    if (typeof url === "string" && url.length > 0) {
      urls.push(url);
    }
  }
  return urls;
}

// ===========================================================================
// Internals: response shape
// ===========================================================================

export interface ShopProductDetailsResponse {
  data?: {
    storefrontProduct?: ShopStorefrontProduct | null;
  };
  errors?: Array<{ message?: string }>;
}

interface ShopStorefrontProduct {
  description?: string | null;
  descriptionHtml?: string | null;
  id?: string;
  media?: { nodes?: ShopMediaNode[] };
  onlineStoreUrl?: string | null;
  salesData?: { approximateQuantitySoldLast30Days?: number | null };
  selectedOrFirstAvailableVariant?: ShopAdjacentVariantNode | null;
  shop?: ShopShop | null;
  title?: string;
  variantsCount?: { count?: number };
}

interface ShopMediaNode {
  alt?: string | null;
  image?: {
    height?: number;
    sensitive?: boolean;
    thumbhash?: string | null;
    url?: string;
    width?: number;
  };
  mediaContentType?: string;
}

interface ShopShop {
  id?: string;
  name?: string;
  shopifyId?: string | null;
  uuid?: string;
  visualTheme?: {
    logoImage?: { url?: string } | null;
  } | null;
  websiteUrl?: string | null;
}

// ===========================================================================
// GraphQL operation — verbatim from the iOS app capture.
// ===========================================================================

const PRODUCT_DETAILS_QUERY = `query ProductDetailsQuery($productInput: StorefrontProductInput!, $imageWidth: Int!, $adToken: String) {
  storefrontProduct(productInput: $productInput, adToken: $adToken) {
    id
    title
    descriptionHtml
    description
    availableForSale
    onlineStoreUrl
    referral
    shareUrl
    eligibleForPriceDropEducation
    requiresSellingPlan
    variantsCount {
      count
      __typename
    }
    displayCustomizations {
      buyNowLabel
      __typename
    }
    offers {
      id
      ... on AutomaticDiscount {
        ...AutomaticDiscount
        __typename
      }
      __typename
    }
    discounts {
      ...ProductDetailsDiscountFragment
      __typename
    }
    shop {
      ...ProductDetailsShopFragment
      __typename
    }
    media {
      nodes {
        ...ProductDetailsMediaFragment
        __typename
      }
      __typename
    }
    options {
      name
      values
      optionValues {
        name
        swatch {
          color
          image {
            ... on StorefrontMediaImage {
              id
              image {
                sensitive
                height
                width
                url(maxWidth: $imageWidth)
                __typename
              }
              __typename
            }
            __typename
          }
          __typename
        }
        __typename
      }
      __typename
    }
    encodedVariantExistence
    quantityLimits {
      maximumPerUser
      __typename
    }
    selectedOrFirstAvailableVariant {
      id
      product {
        id
        isPublishedToOnlineStoreChannel
        __typename
      }
      ...VariantWithBundlesFragment
      __typename
    }
    productDrop {
      ...ProductDropFragment
      __typename
    }
    salesData {
      approximateQuantitySoldLast30Days
      __typename
    }
    productWarnings {
      title
      content
      image {
        url
        altText
        width
        height
        __typename
      }
      __typename
    }
    __typename
  }
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

fragment ProductDetailsDiscountFragment on ShopifyDiscount {
  id
  shortDescription
  detailsTitle
  detailsSubtitle
  code
  discountPercentage
  discountAmount {
    ...MoneyV2Fragment
    __typename
  }
  constraints {
    text
    type
    __typename
  }
  __typename
}

fragment ProductDetailsShopFragment on Shop {
  id
  uuid
  ...ShopInfo
  nativeSubscriptionsEnabled
  shopCashCampaignValue {
    ...MoneyV2Fragment
    __typename
  }
  shopCashIncentive {
    ...ShopCashIncentiveFragment
    __typename
  }
  policies {
    shippingPolicy {
      embedUrl
      __typename
    }
    returnPolicy {
      embedUrl
      __typename
    }
    privacyPolicy {
      embedUrl
      __typename
    }
    __typename
  }
  returnPolicySummary {
    returnWindowDays
    __typename
  }
  offers {
    id
    ... on DiscountOffer {
      ...DiscountOffer
      __typename
    }
    __typename
  }
  shopifyId
  myshopifyDomain
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
  ...StoreContactSheet
  __typename
}

fragment ProductDetailsMediaFragment on StorefrontMediaContent {
  mediaContentType
  alt
  ... on StorefrontMediaImage {
    id
    image {
      sensitive
      height
      width
      url(maxWidth: $imageWidth)
      thumbhash
      __typename
    }
    __typename
  }
  ... on StorefrontVideo {
    id
    previewImage {
      height
      url(maxWidth: $imageWidth)
      __typename
    }
    sources {
      format
      width
      height
      url
      __typename
    }
    __typename
  }
  ... on StorefrontExternalVideo {
    id
    previewImage {
      height
      url(maxWidth: $imageWidth)
      __typename
    }
    embeddedUrl
    __typename
  }
  ... on StorefrontModel3d {
    id
    previewImage {
      height
      url(maxWidth: $imageWidth)
      __typename
    }
    sources {
      format
      mimeType
      url
      __typename
    }
    __typename
  }
  __typename
}

fragment VariantWithBundlesFragment on StorefrontProductVariant {
  ...VariantFragment
  bundledBy {
    nodes {
      ...VariantFragment
      product {
        ...ProductCardWithoutShopCash
        __typename
      }
      __typename
    }
    pageInfo {
      hasNextPage
      __typename
    }
    __typename
  }
  bundleComponents {
    nodes {
      productVariant {
        ...VariantFragment
        product {
          ...ProductCardWithoutShopCash
          __typename
        }
        __typename
      }
      quantity
      __typename
    }
    pageInfo {
      hasNextPage
      __typename
    }
    __typename
  }
  __typename
}

fragment ProductDropFragment on ProductDrop {
  id
  isActive
  isGeoGated
  terms {
    html
    __typename
  }
  assets {
    mediaContentType
    alt
    ... on StorefrontMediaImage {
      id
      image {
        sensitive
        height
        width
        url(maxWidth: $imageWidth)
        __typename
      }
      __typename
    }
    ... on StorefrontVideo {
      id
      previewImage {
        height
        url(maxWidth: $imageWidth)
        __typename
      }
      sources {
        format
        width
        height
        url
        __typename
      }
      __typename
    }
    ... on StorefrontExternalVideo {
      id
      previewImage {
        height
        url(maxWidth: $imageWidth)
        __typename
      }
      embeddedUrl
      __typename
    }
    ... on StorefrontModel3d {
      id
      previewImage {
        height
        url(maxWidth: $imageWidth)
        __typename
      }
      sources {
        format
        mimeType
        url
        __typename
      }
      __typename
    }
    __typename
  }
  serverTime
  isSupportedPlatform
  isProtected
  name
  challenges {
    ...ProductDropsChallenge
    __typename
  }
  displayCustomizations {
    hideBadges
    __typename
  }
  __typename
}

fragment MoneyV2Fragment on MoneyV2 {
  amount
  currencyCode
  __typename
}

fragment ShopInfo on Shop {
  id
  uuid
  name
  followedByMe
  websiteUrl
  shareUrl
  referral
  shopNetwork
  nativeProductPagesEnabled
  storeEligible
  shopifyId
  visualTheme {
    ...VisualTheme
    __typename
  }
  featuredIn {
    handle
    __typename
  }
  ...NavigateToStore
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

fragment DiscountOffer on DiscountOffer {
  id
  text
  image {
    width
    height
    url
    __typename
  }
  discount {
    id
    code
    description
    shortDescription
    conditions {
      text
      type
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

fragment StoreContactSheet on Shop {
  uuid
  name
  contacts {
    id
    method
    methodTarget
    __typename
  }
  businessAddress {
    formatted
    __typename
  }
  websiteUrl
  __typename
}

fragment VariantFragment on StorefrontProductVariant {
  id
  title
  quantityAvailable
  availableForSale
  requiresShipping
  stockStatuses
  lowStockAmount
  variantImage {
    id
    image {
      url(maxWidth: $imageWidth)
      height
      width
      altText
      sensitive
      thumbhash
      __typename
    }
    __typename
  }
  selectedOptions {
    name
    value
    __typename
  }
  compareAtPrice {
    amount
    currencyCode
    __typename
  }
  price {
    amount
    currencyCode
    __typename
  }
  sellingPlanAllocations(first: 250) {
    nodes {
      ...SellingPlanAllocationFragment
      __typename
    }
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

fragment ProductDropsChallenge on ProductDropsChallengeType {
  __typename
  evaluation {
    __typename
    met
    ... on ProductDropsAvailablePeriodChallengeOutsidePeriod {
      availablePeriod {
        start
        end
        __typename
      }
      __typename
    }
    ... on ProductDropsAvailablePeriodChallengeWithinPeriod {
      availablePeriod {
        start
        end
        __typename
      }
      __typename
    }
    ... on ProductDropsGeoGateChallengeMissing {
      beaconConfiguration {
        uuids
        rangingPeriod {
          minimumMs
          maximumMs
          __typename
        }
        __typename
      }
      __typename
    }
    ... on ProductDropsGeoGateChallengeNotPermitted {
      beaconConfiguration {
        uuids
        rangingPeriod {
          minimumMs
          maximumMs
          __typename
        }
        __typename
      }
      __typename
    }
    ... on ProductDropsGeoGateChallengePermitted {
      beaconConfiguration {
        uuids
        rangingPeriod {
          minimumMs
          maximumMs
          __typename
        }
        __typename
      }
      __typename
    }
    ... on ProductDropsMinimumRequiredVersionChallengeMeetsRequirement {
      requiredClientVersion
      __typename
    }
    ... on ProductDropsMinimumRequiredVersionChallengeOutdatedClientVersion {
      clientVersion
      requiredClientVersion
      __typename
    }
    ... on ProductDropsRegistrationChallengeAccepted {
      registrationWindow {
        start
        end
        __typename
      }
      __typename
    }
    ... on ProductDropsRegistrationChallengeInProgress {
      registrationWindow {
        start
        end
        __typename
      }
      __typename
    }
    ... on ProductDropsRegistrationChallengeNotRegistered {
      registrationWindow {
        start
        end
        __typename
      }
      marketingConsentRequirement
      __typename
    }
    ... on ProductDropsRegistrationChallengeRejected {
      registrationWindow {
        start
        end
        __typename
      }
      __typename
    }
  }
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

fragment NavigateToStore on Shop {
  id
  uuid
  name
  storeEligible
  websiteUrl
  inAppVisibilityStatus
  referral
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

fragment SellingPlanAllocationFragment on SellingPlanAllocation {
  priceAdjustments {
    price {
      ...MoneyV2Fragment
      __typename
    }
    compareAtPrice {
      ...MoneyV2Fragment
      __typename
    }
    perDeliveryPrice {
      ...MoneyV2Fragment
      __typename
    }
    __typename
  }
  sellingPlan {
    id
    name
    recurringDeliveries
    billingPolicy {
      __typename
      ... on SellingPlanRecurringBillingPolicy {
        interval
        intervalCount
        __typename
      }
    }
    deliveryPolicy {
      __typename
      ... on SellingPlanRecurringDeliveryPolicy {
        interval
        intervalCount
        __typename
      }
    }
    priceAdjustments {
      orderCount
      adjustmentValue {
        __typename
        ... on SellingPlanPercentagePriceAdjustment {
          adjustmentPercentage
          __typename
        }
        ... on SellingPlanFixedPriceAdjustment {
          price {
            ...MoneyV2Fragment
            __typename
          }
          __typename
        }
        ... on SellingPlanFixedAmountPriceAdjustment {
          adjustmentAmount {
            ...MoneyV2Fragment
            __typename
          }
          __typename
        }
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
    __typename
  }
  __typename
}
`;
