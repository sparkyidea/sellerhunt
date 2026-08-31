/**
 * Listing ID → full listing detail, via eBay's mobile-app view-item endpoint
 * (`apisd.ebay.com/experience/listing_details/v2/view_item`).
 *
 * This is the request the iOS app fires when you tap into a listing. It returns
 * the data the search-results card cannot: lifetime sold count, sold-in-last-24h,
 * full description, category breadcrumb, multi-SKU variations, return policy.
 *
 * Same caveats as the rest of `marketplace-scan`: not the public Browse API,
 * JSON shape can change without notice, bearer-token auth is unofficial.
 */
import { convert } from "html-to-text";
import type { ScanListing } from "../../../types";
import { ebayFetch } from "../http";
import type {
  EbayListingDetailResponse,
  HotnessSignal,
  Listing as VlsListing,
  Seller as VlsSeller,
} from "../raw-types/listing-detail-response";
import {
  extractItemSold,
  extractSignalCount,
} from "./helper/extract-sold-count";
import { mapListing } from "./mapper/map-listing";

const VIEW_ITEM_ENDPOINT =
  "https://apisd.ebay.com/experience/listing_details/v2/view_item";

const SUPPORTED_UX_COMPONENTS = [
  "ACTION_BAR",
  "ACTION_BAR_SMALL",
  "ALERT",
  "ALERT_FITMENT",
  "ALERT_GUIDANCE",
  "ALERT_INLINE",
  "AT_A_GLANCE",
  "BANNER_IMAGE",
  "BUSINESS_SELLER_INFORMATION",
  "BUYING_FLOW",
  "BUY_BOX",
  "BUY_BOX_CTA",
  "COMPARE_CONTRAST",
  "CONDITION",
  "CONDITION_V2",
  "CONDITION_CONTAINER",
  "COUPON",
  "COUPON_LAYER",
  "CUSTOMIZATION",
  "EBAY_PLUS_PROMO",
  "EDUCATION",
  "FEEDBACK_DETAILED_SELLER_RATING_SUMMARY",
  "FEEDBACK_DETAIL_LIST_V2_HORIZONTAL",
  "FEEDBACK_DETAIL_LIST_TABBED_V2_HORIZONTAL",
  "FINDERS",
  "HAZMAT",
  "HEADER_AND_OVERLAY",
  "ITEM_CARD",
  "ITEM_CONDENSED",
  "ITEM_CONDENSED_CONTAINER",
  "ITEM_QA",
  "ITEM_STATUS_MESSAGE",
  "MSKU_PICKER",
  "PICTURES",
  "PRICE_DETAILS",
  "QUANTITY",
  "SECTIONS",
  "SECTIONS_GROUPED",
  "SECTIONS_MIN_SPACE",
  "SECTIONS_PROGRESSIVE",
  "SME",
  "SURVEY",
  "TIMER_STATUS",
  "TITLE",
  "VALIDATE",
  "VAS_HUB_V2",
  "VAS_INTRO",
  "VAS_SPOKE_V2",
  "VEHICLE_HISTORY",
  "VLS",
  "COMMON_CHARGER_DIRECTIVE",
  "SEMANTIC_DATA_V2",
  "MERCH_ASPECT_SELECTION_BANNER",
  "MERCH_CAROUSEL",
  "MERCH_DISCOVERY",
  "MERCH_FEED",
  "MERCH_GRID",
  "MERCH_GROUPED_CAROUSEL",
  "MERCH_NAVIGATION_LIST_GROUPED_CAROUSEL",
  "MERCH_PAGED_GRID",
  "AD_PD_S2",
  "AD_PD_S3",
  "VOLUME_PRICING",
].join(",");

const SUPPORTED_GADGET_UX_COMPONENTS = [
  "BEST_OFFER_TOOL_TIP",
  "TOOL_TIP_WITH_DISMISS",
  "FIXED_COUPON_BANNER_V3",
  "DRAWER_COUPON_BANNER",
  "REWARDS_ENROLLMENT_MODAL",
  "REWARDS_ACTIVATION_MODAL",
  "REWARDS_REDEMPTION_MODAL",
  "WIDGET_RESPONSE_MODAL",
  "COUPONS_LAYER",
  "EBAY_PLUS_BANNER",
  "CHECK_PSA_DATA_TOOL_TIP",
].join(",");

export interface GetListingOptions {
  /** Bearer token for the eBay mobile API. */
  authToken: string;
  /** eBay item ID, e.g. "136784592725". */
  listingId: string;
}

export interface GetListingResult {
  /** Form for `scan_listing` (+ nested variants children). */
  listing: ScanListing;
  /** Echoed for convenience. */
  listingId: string;
  /** Raw response body. Shape is sample-derived — see `types/listing-detail-response.ts`. */
  raw: EbayListingDetailResponse;
}

export interface Listing {
  /** Category breadcrumb, root → leaf, e.g. ["Toys & Hobbies", "Collectible Card Games", "CCG Sealed Packs"]. */
  categoryPath: string[];
  /** Human-readable condition, e.g. "New/Factory Sealed". */
  condition: string | null;
  /** eBay's numeric condition ID, e.g. "1000". */
  conditionId: string | null;
  /** ISO-4217 currency code. */
  currency: string | null;
  /** Plain-text description, extracted from eBay's HTML via `html-to-text`. */
  description: string | null;
  /** Listing end date, ISO-8601. */
  endedAt: string | null;
  /** True if the listing is Good Till Cancelled. */
  goodTillCancelled: boolean | null;
  /** All listing image URLs in display order. */
  imageUrls: string[];
  /** Lifetime items sold for this listing (the key scanner metric). */
  itemSold: number | null;
  /** Listing format from eBay, normalized to lowercase ("fixed_price" / "auction"). */
  listingFormat: string | null;
  /** Marketplace identifier from VLS, e.g. "EBAY_US". */
  marketplaceListedOn: string | null;
  /** Display price as a number. */
  price: number | null;
  /** Seller — username, feedback, store info. Null if VLS omitted seller. */
  seller: ListingSeller | null;
  /**
   * Items sold in the last 24h. Best-effort: pulled from a "sold in last 24"
   * hotness signal if eBay surfaces one for this listing; null otherwise.
   * Most listings don't have this signal — only high-velocity ones do.
   */
  soldIn24h: number | null;
  /** Listing start date, ISO-8601. */
  startedAt: string | null;
  /** Listing title. */
  title: string | null;
  /**
   * Per-variation entries from `vls.itemVariations[]`. Empty array for
   * single-item listings (no MSKU). Mapped → `scan_listing_variant` rows by
   * `mapVariants` in the mapper layer.
   */
  variations: ParsedListingVariant[];
  /** Active watcher count from `tradingSummary.watchCount`. */
  watchCount: number | null;
}

export interface ParsedListingVariant {
  /**
   * Option name → value, e.g. {"Number/Style": "1 Mario", "Color": "Red"}.
   * Sourced from `itemVariations[].aspects[].name.content` →
   * `aspects[].aspectValues[0].value.content`. Null when the variation has
   * no aspect data.
   */
  attributes: Record<string, string> | null;
  /** Stock count after subtracting sold (`remainingQuantity`), when surfaced. */
  availableQuantity: number | null;
  /** ISO-4217 currency from `priceSettings.computations.price.basePrice.currency`. */
  currency: string | null;
  /**
   * Aspect-value image URLs collected across all aspects (one per swatch
   * image, in aspect order). Empty array when none.
   */
  imageUrls: string[];
  /** Display price (DOLLARS) from `priceSettings.computations.price.basePrice.value`. */
  price: number | null;
  /** Seller-provided SKU string (e.g. "1 Mario"). Often equals an aspect value. */
  sku: string | null;
  /** Lifetime sold count for this variation, when surfaced. */
  soldQuantity: number | null;
  /** eBay's variationId stringified — used as `scan_listing_variant.reference`. */
  variationId: string;
}

export interface ListingSeller {
  /** % positive feedback, normalized to 0..1 (e.g. 99.8% → 0.998). */
  feedbackPercent: number | null;
  /** Lifetime feedback count. */
  feedbackScore: number | null;
  /** Whether the seller has the eBay PowerSeller flag. */
  powerSeller: boolean | null;
  /** Seller registration date, ISO-8601. */
  registrationDate: string | null;
  /** Store display name (only when `hasStore` is true). */
  storeName: string | null;
  /** Stable internal seller ID. */
  userId: string | null;
  /** eBay seller username (the same value scanner methods use). */
  username: string | null;
}

/**
 * Direct layer — build the view-item request and return the raw response body.
 * No parsing. Sandbox `direct-api/` scripts call this to capture raw payloads
 * for shape discovery, independent of whether the parser/mapper succeed.
 */
export function fetchListingDetail(
  options: GetListingOptions
): Promise<EbayListingDetailResponse> {
  const url = new URL(VIEW_ITEM_ENDPOINT);
  url.searchParams.set("itemId", options.listingId);
  url.searchParams.set("modules", "VLS");
  url.searchParams.set("supportedPartialModules", "VOLUME_PRICING");
  url.searchParams.set("supported_ux_components", SUPPORTED_UX_COMPONENTS);
  url.searchParams.set("quantity", "1");
  url.searchParams.set("enableVIM", "true");
  url.searchParams.set(
    "supported_gadget_ux_components",
    SUPPORTED_GADGET_UX_COMPONENTS
  );

  return ebayFetch<EbayListingDetailResponse>({
    endpoint: "ebay.get-listing",
    url: url.toString(),
    headers: {
      Accept: "application/json;presentity=split",
      Authorization: `Bearer ${options.authToken}`,
    },
  });
}

/**
 * Adapter layer — fetch the raw response, then parse + map to the unified
 * `ScanListing` form.
 */
export async function getListing(
  options: GetListingOptions
): Promise<GetListingResult> {
  const raw = await fetchListingDetail(options);
  const parsed = parseListing(raw);
  const listing = mapListing({
    listingId: options.listingId,
    parsed,
  });

  return {
    listingId: options.listingId,
    listing,
    raw,
  };
}

/**
 * Pull the parsed listing out of the view-item response.
 *
 * Sources (verified against listing 136784592725):
 *   - `modules.VLS.listing` — structured listing record: title, description,
 *     images, format, lifecycle, classification, seller. The good stuff.
 *   - `modules.VLS.buyingContext.hotnessSignals[]` — itemSold, watchCount,
 *     and (best-effort) soldIn24h.
 *   - `modules.BUY_BOX.binModel.price.value` — display price + currency.
 */
function parseListing(raw: EbayListingDetailResponse): Listing {
  const vls = raw.modules?.VLS?.listing;
  const signals = raw.modules?.VLS?.buyingContext?.hotnessSignals ?? [];
  const buyBox = raw.modules?.BUY_BOX?.binModel?.price;

  return {
    categoryPath: extractCategoryPath(vls),
    condition:
      vls?.listingClassification?.generalCondition?.condition?.name?.content ??
      null,
    conditionId:
      vls?.listingClassification?.generalCondition?.condition?.conditionId ??
      null,
    currency: buyBox?.value?.currency ?? null,
    description: extractDescription(vls?.description?.content),
    endedAt: vls?.listingLifecycle?.scheduledEndDate?.value ?? null,
    goodTillCancelled: vls?.listingLifecycle?.goodTillCancelled ?? null,
    imageUrls: extractImageUrls(vls),
    itemSold: extractItemSold(vls),
    marketplaceListedOn: vls?.marketplaceListedOn ?? null,
    listingFormat: vls?.format ? vls.format.toLowerCase() : null,
    price: typeof buyBox?.value?.value === "number" ? buyBox.value.value : null,
    seller: extractSeller(vls),
    soldIn24h: extractSoldIn24h(signals),
    startedAt: vls?.listingLifecycle?.scheduledStartDate?.value ?? null,
    title: vls?.title?.content ?? null,
    variations: extractVariations(vls),
    watchCount: extractSignalCount(signals, "WATCHERS_COUNT_TOTAL_SIGNAL"),
  };
}

/**
 * Walk `vls.itemVariations[]` to produce `ParsedListingVariant[]`.
 *
 * Each `itemVariations` entry carries:
 *   - `variationId` (numeric)
 *   - `sellerProvidedSKU` (e.g. "1 Mario")
 *   - `priceSettings.computations.price.basePrice` → price + currency
 *   - `quantityAndAvailabilityByLogisticsPlans[].quantityAndAvailability` → stock
 *   - `aspects[].name.content` + `aspects[].aspectValues[*].value.content` →
 *     option name → value (multi-axis listings have multiple aspects entries)
 *
 * Single-item listings have no `itemVariations` block (or it's empty); the
 * mapper layer falls back to `mapSingleVariant` in that case.
 *
 * The `vls` type from the autogen file doesn't include `itemVariations`, so
 * we cast through a small local interface — same pattern used elsewhere when
 * the autogen lags behind a real-world payload field.
 */
function extractVariations(
  vls: VlsListing | undefined
): ParsedListingVariant[] {
  const raw = (vls as VlsWithItemVariations | undefined)?.itemVariations;
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: ParsedListingVariant[] = [];
  for (const entry of raw) {
    if (typeof entry?.variationId !== "number") {
      continue;
    }
    out.push(parseVariation(entry));
  }
  return out;
}

function parseVariation(entry: RawItemVariation): ParsedListingVariant {
  const basePrice = entry.priceSettings?.computations?.price?.basePrice;
  const availability =
    entry.quantityAndAvailabilityByLogisticsPlans?.[0]?.quantityAndAvailability;

  return {
    availableQuantity:
      typeof availability?.remainingQuantity === "number"
        ? availability.remainingQuantity
        : (availability?.availableQuantity ?? null),
    attributes: extractAspectAttributes(entry.aspects),
    currency: basePrice?.currency ?? null,
    imageUrls: extractAspectImageUrls(entry.aspects),
    price: typeof basePrice?.value === "number" ? basePrice.value : null,
    soldQuantity:
      typeof availability?.soldQuantity === "number"
        ? availability.soldQuantity
        : null,
    sku: entry.sellerProvidedSKU ?? null,
    variationId: String(entry.variationId),
  };
}

function extractAspectAttributes(
  aspects: RawAspect[] | undefined
): Record<string, string> | null {
  if (!aspects || aspects.length === 0) {
    return null;
  }
  const attrs: Record<string, string> = {};
  for (const aspect of aspects) {
    const name = aspect?.name?.content?.trim();
    const value = aspect?.aspectValues?.[0]?.value?.content?.trim();
    if (name && value) {
      attrs[name] = value;
    }
  }
  return Object.keys(attrs).length > 0 ? attrs : null;
}

function extractAspectImageUrls(aspects: RawAspect[] | undefined): string[] {
  if (!aspects) {
    return [];
  }
  const urls: string[] = [];
  for (const aspect of aspects) {
    for (const value of aspect?.aspectValues ?? []) {
      for (const image of value?.images ?? []) {
        if (typeof image?.imageURL === "string" && image.imageURL.length > 0) {
          urls.push(image.imageURL);
        }
      }
    }
  }
  return urls;
}

interface VlsWithItemVariations {
  itemVariations?: RawItemVariation[];
}

interface RawItemVariation {
  aspects?: RawAspect[];
  priceSettings?: {
    computations?: {
      price?: { basePrice?: { currency?: string; value?: number } };
    };
  };
  quantityAndAvailabilityByLogisticsPlans?: Array<{
    quantityAndAvailability?: {
      availabilityStatus?: string;
      availableQuantity?: number;
      remainingQuantity?: number;
      soldQuantity?: number;
    };
  }>;
  sellerProvidedSKU?: string;
  variationId?: number;
}

interface RawAspect {
  aspectValues?: Array<{
    images?: Array<{ imageURL?: string }>;
    value?: { content?: string };
  }>;
  name?: { content?: string };
}

/**
 * Strip eBay's HTML description down to plain text. Mirrors the seller-side
 * pull-listings mapper so monitor and seller-side rows store consistent text.
 * Empty result → null so consumers can branch on "no description".
 */
function extractDescription(html: string | undefined | null): string | null {
  if (!html) {
    return null;
  }
  const text = convert(html).trim();
  return text.length > 0 ? text : null;
}

function extractCategoryPath(vls: VlsListing | undefined): string[] {
  const ids =
    vls?.listingClassification?.leafCategories?.[0]?.categoryPathFromRoot
      ?.categoryIdentifier;
  if (!ids) {
    return [];
  }
  return ids
    .map((c) => c.name?.content?.trim() ?? "")
    .filter((s) => s.length > 0);
}

function extractImageUrls(vls: VlsListing | undefined): string[] {
  if (!vls?.images) {
    return [];
  }
  return vls.images
    .map((img) => img.imageURL ?? "")
    .filter((s) => s.length > 0);
}

const SOLD_IN_24H_RE = /([\d,]+)\s+sold\s+in\s+(?:the\s+)?last\s+24/i;
const SOLD_IN_24H_SIGNAL_NAME_RE = /24H?_SOLD|SOLD_IN_24/i;

/**
 * Best-effort soldIn24h: looks for a hotness signal whose name contains "24"
 * (e.g. `LAST_24H_SOLD_SIGNAL`) and falls back to scanning hotnessMessage
 * strings for "X sold in last 24" pattern. Most listings don't have this
 * signal — eBay only surfaces it for high-velocity items.
 */
function extractSoldIn24h(signals: HotnessSignal[]): number | null {
  for (const s of signals) {
    if (s.signal && SOLD_IN_24H_SIGNAL_NAME_RE.test(s.signal)) {
      const fromProps = extractIntSignalRaw(s);
      if (fromProps !== null) {
        return fromProps;
      }
    }
    if (s.hotnessMessage) {
      const m = SOLD_IN_24H_RE.exec(s.hotnessMessage);
      if (m?.[1]) {
        const n = Number.parseInt(m[1].replace(/,/g, ""), 10);
        if (Number.isFinite(n)) {
          return n;
        }
      }
    }
  }
  return null;
}

function extractIntSignalRaw(s: HotnessSignal): number | null {
  for (const prop of s.properties ?? []) {
    for (const v of prop.propertyValues ?? []) {
      if (typeof v.intValue === "number") {
        return v.intValue;
      }
      if (typeof v.longValue === "number") {
        return v.longValue;
      }
    }
  }
  return null;
}

function extractSeller(vls: VlsListing | undefined): ListingSeller | null {
  const s: VlsSeller | undefined = vls?.seller;
  if (!s) {
    return null;
  }
  return {
    feedbackPercent:
      typeof s.positiveFeedbackPercentage === "number"
        ? s.positiveFeedbackPercentage / 100
        : null,
    feedbackScore: s.feedbackScore ?? null,
    powerSeller: s.powerSeller ?? null,
    registrationDate: s.registrationDate?.value ?? null,
    storeName: s.hasStore
      ? (s.ebayStore?.displayName?.content ?? s.ebayStore?.name ?? null)
      : null,
    userId: s.userIdentifier?.userId ?? null,
    username: s.userIdentifier?.username ?? null,
  };
}
