/**
 * Product id + selected options → variants adjacent to that combination, via
 * shop.app's `AdjacentVariantsQuery` GraphQL operation against
 * `server.shop.app/graphql`.
 *
 * The product-detail endpoint (`ProductDetailsQuery`) only returns the
 * selected/first-available variant, not the full variant set. To enumerate
 * every variant of a multi-variant product, the iOS app fires this query
 * with the current variant's `selectedOptions` and receives the *other*
 * variants — i.e. siblings, not including the one passed in.
 *
 * Single-axis products converge in one call. Multi-axis products may need
 * multiple calls because shop.app's "adjacent" semantics are not documented;
 * the orchestrator in `getListing` iterates with a cap to handle this.
 *
 * Same caveats as the rest of `marketplace-scan`: not a documented API,
 * GraphQL shape can change without notice, bearer-token auth is unofficial.
 */
import { ScanRequestError } from "../../../errors";

const GRAPHQL_ENDPOINT = "https://server.shop.app/graphql";

const SHOP_USER_AGENT = "Shop/2.250.1-release.289403 ios/16.3";
const SHOP_MINIS_PLATFORM_VERSION = "0.15.0";

/**
 * iPhone XR screen width in pixels — captured from the iOS app. Image URLs
 * in the response are sized to this. Callers can override per-call.
 */
const DEFAULT_IMAGE_WIDTH = 1242;

export interface ShopVariantOption {
  name: string;
  value: string;
}

export interface GetAdjacentVariantsOptions {
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
   * Shopify product id (numeric, no `gid://shopify/Product/` prefix — e.g.
   * `"8404160315548"`). Same value `getListing` consumes — used uniformly
   * across scan adapters as `listingId`. shop.app's GraphQL takes this as
   * `$productId` on the wire; the wire-layer name is preserved inside the
   * request body only.
   */
  listingId: string;
  /**
   * Currently-selected option combination for which we want adjacent
   * variants. Returned variants are siblings — the response does NOT include
   * the variant matching this exact combination. The orchestrator must merge
   * the seed variant in separately.
   */
  selectedOptions: ShopVariantOption[];
}

export interface GetAdjacentVariantsResult {
  /**
   * Adjacent variants in display order. Each carries enough fields to
   * populate `ScanListingVariant` (id, options, image, price) AND to drive
   * the next iteration of adjacency (selectedOptions).
   */
  adjacentVariants: ParsedVariant[];
  /** Echoed for convenience. */
  listingId: string;
  /** Raw GraphQL response. Use for shape-drift inspection. */
  raw: ShopAdjacentVariantsResponse;
}

/**
 * Canonical shop variant shape — used by both `getAdjacentVariants` (the
 * adjacent set) and the orchestrator in `getListing` (when re-parsing the
 * `selectedOrFirstAvailableVariant` from `ProductDetailsQuery`). The mapper
 * consumes a uniform list of these to build `ScanListingVariant[]`.
 */
export interface ParsedVariant {
  /** True if the variant is currently purchasable. */
  availableForSale: boolean | null;
  /** Compare-at currency (the struck-through "MSRP" currency). */
  compareAtCurrency: string | null;
  /** Compare-at price in display dollars. Null when not on sale. */
  compareAtPrice: number | null;
  /** ISO-4217 currency code from the variant's price. */
  currency: string | null;
  /** Shopify variant gid (e.g. `gid://shopify/ProductVariant/44908949766300`). */
  id: string;
  /** Variant image URL, when present. */
  imageUrl: string | null;
  /** Low-stock threshold reported by Shopify, when set. */
  lowStockAmount: number | null;
  /** Display price in dollars (parseFloat of MoneyV2.amount). Null when missing. */
  price: number | null;
  /** Available stock count, when surfaced. */
  quantityAvailable: number | null;
  /** Selected option combination for THIS variant. */
  selectedOptions: ShopVariantOption[];
  /** Stock status flags surfaced by shop.app (e.g. ["IN_STOCK"], ["LOW_STOCK"]). */
  stockStatuses: string[];
  /** Variant title (often "Default Title" for single-variant products). */
  title: string | null;
}

export async function getAdjacentVariants(
  options: GetAdjacentVariantsOptions
): Promise<GetAdjacentVariantsResult> {
  const sessionId = crypto.randomUUID();
  const imageWidth = options.imageWidth ?? DEFAULT_IMAGE_WIDTH;

  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "*/*",
      "Accept-Language": "en",
      Authorization: `Bearer ${options.authToken}`,
      "Content-Type": "application/json",
      "User-Agent": SHOP_USER_AGENT,
      "session-id": sessionId,
      "x-device-id": options.deviceId,
      "x-device-id-hw": options.deviceIdHw,
      "x-device-name": options.deviceName,
      "x-feature-overrides": "",
      "x-features": "",
      "x-preview-overrides": "null",
      "x-shop-minis-platform-versions": SHOP_MINIS_PLATFORM_VERSION,
    },
    body: JSON.stringify({
      operationName: "AdjacentVariantsQuery",
      variables: {
        imageWidth,
        // `$productId` is shop.app's GraphQL variable name; option/echo
        // field exposed to callers is `listingId` for cross-adapter parity.
        productId: options.listingId,
        selectedOptions: options.selectedOptions,
      },
      query: ADJACENT_VARIANTS_QUERY,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new ScanRequestError({
      endpoint: "shop.get-adjacent-variants",
      message: `shop.app monitor get-adjacent-variants failed (${response.status}): ${errorText.slice(0, 500)}`,
      status: response.status,
      body: errorText.slice(0, 500),
    });
  }

  const raw = (await response.json()) as ShopAdjacentVariantsResponse;

  // GraphQL-layer errors return HTTP 200 with a populated `errors[]`. Surface
  // them as 400 so callers see structural failures distinctly from 401/5xx.
  if (Array.isArray(raw.errors) && raw.errors.length > 0) {
    const message = raw.errors[0]?.message ?? "shop.app GraphQL error";
    throw new ScanRequestError({
      endpoint: "shop.get-adjacent-variants",
      message: `shop.app monitor get-adjacent-variants GraphQL error: ${message}`,
      status: 400,
      body: JSON.stringify(raw.errors).slice(0, 500),
    });
  }

  const nodes =
    raw.data?.storefrontProductAdjacentVariants?.adjacentVariants ?? [];
  const adjacentVariants = nodes
    .filter((v): v is ShopAdjacentVariantNode => Boolean(v?.id))
    .map(parseVariant);

  return {
    adjacentVariants,
    listingId: options.listingId,
    raw,
  };
}

/**
 * Parse a raw shop variant node into the canonical `ParsedVariant` shape.
 * Exported so the orchestrator in `getListing` can re-use it on the
 * `selectedOrFirstAvailableVariant` returned by `ProductDetailsQuery`
 * (same `StorefrontProductVariant` shape).
 */
export function parseVariant(node: ShopAdjacentVariantNode): ParsedVariant {
  return {
    availableForSale:
      typeof node.availableForSale === "boolean" ? node.availableForSale : null,
    compareAtCurrency: node.compareAtPrice?.currencyCode ?? null,
    compareAtPrice: parseMoneyAmount(node.compareAtPrice?.amount),
    currency: node.price?.currencyCode ?? null,
    id: node.id,
    imageUrl: node.variantImage?.image?.url ?? null,
    lowStockAmount:
      typeof node.lowStockAmount === "number" ? node.lowStockAmount : null,
    price: parseMoneyAmount(node.price?.amount),
    quantityAvailable:
      typeof node.quantityAvailable === "number"
        ? node.quantityAvailable
        : null,
    selectedOptions: extractSelectedOptions(node.selectedOptions),
    stockStatuses: Array.isArray(node.stockStatuses)
      ? node.stockStatuses.filter((s): s is string => typeof s === "string")
      : [],
    title: node.title ?? null,
  };
}

function extractSelectedOptions(
  options: Array<{ name?: string; value?: string }> | null | undefined
): ShopVariantOption[] {
  if (!options) {
    return [];
  }
  const out: ShopVariantOption[] = [];
  for (const option of options) {
    if (typeof option?.name === "string" && typeof option.value === "string") {
      out.push({ name: option.name, value: option.value });
    }
  }
  return out;
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
// parser reads are typed; everything else is left open so shape drift
// surfaces at the extraction sites rather than deep in the type tree.
// ===========================================================================

export interface ShopAdjacentVariantsResponse {
  data?: {
    storefrontProductAdjacentVariants?: {
      adjacentVariants?: Array<ShopAdjacentVariantNode | null>;
      id?: string;
    } | null;
  };
  errors?: Array<{ message?: string }>;
}

/** Shape of a single variant node — shared with the variant returned inside
 *  ProductDetailsQuery's `selectedOrFirstAvailableVariant` (same Shopify
 *  StorefrontProductVariant type at the GraphQL layer). */
export interface ShopAdjacentVariantNode {
  availableForSale?: boolean;
  compareAtPrice?: ShopMoney | null;
  id: string;
  lowStockAmount?: number | null;
  price?: ShopMoney | null;
  quantityAvailable?: number | null;
  selectedOptions?: Array<{ name?: string; value?: string }>;
  stockStatuses?: string[];
  title?: string;
  variantImage?: { image?: { url?: string } | null } | null;
}

interface ShopMoney {
  amount?: string;
  currencyCode?: string;
}

// ===========================================================================
// GraphQL operation — verbatim from the iOS app capture.
// ===========================================================================

const ADJACENT_VARIANTS_QUERY = `query AdjacentVariantsQuery($productId: ID!, $imageWidth: Int!, $selectedOptions: [StorefrontProductVariantSelectedOptionInput!]) {
  storefrontProductAdjacentVariants(
    productId: $productId
    selectedOptions: $selectedOptions
  ) {
    id
    adjacentVariants {
      id
      ...VariantWithBundlesFragment
      __typename
    }
    __typename
  }
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
`;
