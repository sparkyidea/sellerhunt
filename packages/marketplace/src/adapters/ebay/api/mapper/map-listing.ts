// eBay's `Item` maps to our `listing`. Rule: CHN-007 — map by meaning
// against `.domain/channels/terminology.md`, never by matching the vendor's
// noun to our same-named entity. Nothing here produces a neutral `Product`;
// no marketplace supplies one.
import type { GetItemResponse } from "ebay-api/lib/types";
import { convert } from "html-to-text";
import type { Listing, ListingVariant } from "../../../../types";
import { convertListingStatus } from "../../enums";
import { extractBrand } from "../helper/extract-brand";
import { extractDimensionsAndWeight } from "../helper/extract-dimensions";
import { extractPrice } from "../helper/extract-price";
import { generateVariantReference } from "../helper/generate-variant-reference";
import { mapVariants } from "./map-variants";

function toArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
}

function extractImageUrls(item: GetItemResponse["Item"]): string[] {
  if (!item.PictureDetails?.PictureURL) {
    return [];
  }
  return toArray(item.PictureDetails.PictureURL);
}

function extractVariationPictures(item: GetItemResponse["Item"]) {
  const raw = item.Variations?.Pictures?.VariationSpecificPictureSet;
  if (!raw) {
    return undefined;
  }
  return toArray(raw);
}

function parseReturnWindow(option?: string): number | null {
  if (!option) {
    return null;
  }
  return Number.parseInt(option.replace("Days_", ""), 10);
}

function extractPriceCents(price?: number | { value: number }): number | null {
  const value = extractPrice(price);
  if (value === 0) {
    return null;
  }
  return Math.round(value * 100);
}

function mapSingleVariant(
  item: GetItemResponse["Item"],
  listingImageUrls: string[]
): ListingVariant {
  const quantity = item.Quantity || 0;
  const quantitySold = item.SellingStatus?.QuantitySold || 0;
  const availableQuantity = Math.max(0, quantity - quantitySold);

  const priceValue =
    extractPrice(item.BuyItNowPrice) ||
    extractPrice(item.SellingStatus?.CurrentPrice) ||
    extractPrice(item.StartPrice) ||
    0;
  const price = Math.round(priceValue * 100);

  const { length, width, height, weight } = extractDimensionsAndWeight(item);

  return {
    sku: item.SKU || null,
    model: null,
    upc: null,
    ean: null,
    isbn: null,
    gtin: null,
    attributes: null,
    price: price || 0,
    length: length ?? 0,
    width: width ?? 0,
    height: height ?? 0,
    weight: weight ?? 0,
    imageUrls: listingImageUrls.length > 0 ? listingImageUrls : null,
    reference: generateVariantReference(item.ItemID, {}),
    quantity: availableQuantity,
    sold: quantitySold,
  };
}

function mapReturnPolicy(item: GetItemResponse["Item"]) {
  const policy = item.ReturnPolicy;
  return {
    domesticReturn: policy?.ReturnsAcceptedOption === "ReturnsAccepted",
    domesticReturnWindow: parseReturnWindow(policy?.ReturnsWithinOption),
    domesticReturnPaidBy: policy?.ShippingCostPaidBy || null,
    internationalReturn:
      policy?.InternationalReturnsAcceptedOption === "ReturnsAccepted",
    internationalReturnWindow: parseReturnWindow(
      policy?.InternationalReturnsWithinOption
    ),
    internationalReturnPaidBy:
      policy?.InternationalShippingCostPaidByOption || null,
    restockingFee: null,
  };
}

interface ShippingServiceOption {
  FreeShipping?: boolean;
  ShippingService?: string;
  ShippingServiceAdditionalCost?: number | { value: number };
  ShippingServiceCost?: number | { value: number };
  ShippingServicePriority?: number;
}

function pickPrimaryOption<T extends ShippingServiceOption>(
  options: T | T[] | undefined
): T | undefined {
  if (!options) {
    return undefined;
  }
  const list = Array.isArray(options) ? options : [options];
  if (list.length === 0) {
    return undefined;
  }
  return [...list].sort(
    (a, b) =>
      (a.ShippingServicePriority ?? Number.MAX_SAFE_INTEGER) -
      (b.ShippingServicePriority ?? Number.MAX_SAFE_INTEGER)
  )[0];
}

function mapShippingDetails(item: GetItemResponse["Item"]) {
  const details = item.ShippingDetails;
  const domesticOption = pickPrimaryOption(details?.ShippingServiceOptions);
  const internationalOption = pickPrimaryOption(
    details?.InternationalShippingServiceOption
  );

  const domesticType = details?.ShippingType ?? null;
  const internationalType = internationalOption ? domesticType : null;

  const domesticBaseFee = domesticOption?.FreeShipping
    ? 0
    : extractPriceCents(domesticOption?.ShippingServiceCost);

  return {
    domesticShipping: !!domesticType || !!domesticOption?.ShippingService,
    domesticShippingType: domesticType,
    domesticShippingBaseFee: domesticBaseFee,
    domesticShippingAdditionalFee: extractPriceCents(
      domesticOption?.ShippingServiceAdditionalCost
    ),
    internationalShipping: !!internationalOption?.ShippingService,
    internationalShippingType: internationalType,
    internationalShippingBaseFee: extractPriceCents(
      internationalOption?.ShippingServiceCost
    ),
    internationalShippingAdditionalFee: extractPriceCents(
      internationalOption?.ShippingServiceAdditionalCost
    ),
  };
}

/**
 * Map eBay GetItem response to normalized Listing.
 *
 * `observedAt` is the GetItem response `Timestamp` — an observation
 * version, not a modification clock (the Trading API exposes none). It
 * becomes `sourceVersionAt` and must only ever be compared against other
 * eBay observations.
 */
export function mapListing(
  item: GetItemResponse["Item"],
  observedAt: Date | null = null
): Listing {
  const imageUrls = extractImageUrls(item);
  const variationPictures = extractVariationPictures(item);

  const listingVariants: ListingVariant[] = mapVariants(
    item,
    imageUrls,
    variationPictures
  );
  const hasEbayVariations = listingVariants.length > 0;

  if (!hasEbayVariations) {
    listingVariants.push(mapSingleVariant(item, imageUrls));
  }

  return {
    marketplaceCategoryReference: String(item.PrimaryCategory?.CategoryID ?? 0),
    title: item.Title ?? "",
    description: item.Description ? convert(item.Description) : "",
    descriptionHtml: item.Description || null,
    brand: extractBrand(item.ItemSpecifics),
    manufacturer: null,
    condition:
      item.ConditionDisplayName || String(item.ConditionID) || "Unknown",
    conditionNote: null,
    imageUrls: imageUrls.length > 0 ? imageUrls : null,
    variant: hasEbayVariations,
    reference: String(item.ItemID),
    sourceVersionAt: observedAt,
    observedAt,
    subTitle: item.SubTitle || null,
    type: item.ListingType || "FixedPriceItem",
    url: item.ListingDetails?.ViewItemURL || "",
    watchCount: item.WatchCount ? Number(item.WatchCount) : null,
    viewCount: null,
    duration: item.ListingDuration || null,
    status: convertListingStatus(item.SellingStatus?.ListingStatus),
    offer: item.BestOfferDetails?.BestOfferEnabled || null,
    offerAcceptPrice: null,
    offerDeclinePrice: null,
    ...mapReturnPolicy(item),
    localPickup: false,
    handlingTime: item.DispatchTimeMax || 1,
    handlingFee: null,
    ...mapShippingDetails(item),
    startedAt: item.ListingDetails?.StartTime
      ? new Date(item.ListingDetails.StartTime)
      : new Date(),
    endedAt: item.ListingDetails?.EndTime
      ? new Date(item.ListingDetails.EndTime)
      : null,
    listingVariants,
  };
}
