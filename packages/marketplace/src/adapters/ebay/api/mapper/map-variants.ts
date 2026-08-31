import type { GetItemResponse } from "ebay-api/lib/types";
import type { ListingVariant } from "../../../../types";
import { extractDimensionsAndWeight } from "../helper/extract-dimensions";
import { extractPrice } from "../helper/extract-price";
import { generateVariantReference } from "../helper/generate-variant-reference";

// SDK types Variation as a single object, but eBay returns an array
type EbayVariation = NonNullable<
  NonNullable<GetItemResponse["Item"]["Variations"]>["Variation"]
>;

interface VariationPicture {
  PictureURL?: string | string[];
  VariationSpecificValue?: string;
}

function parseAttributes(variation: EbayVariation): Record<string, string> {
  const attributes: Record<string, string> = {};
  const nameValueList = variation.VariationSpecifics?.NameValueList;

  if (!nameValueList) {
    return attributes;
  }

  const list = Array.isArray(nameValueList) ? nameValueList : [nameValueList];

  for (const nvPair of list) {
    if (nvPair.Name && nvPair.Value) {
      attributes[nvPair.Name] = nvPair.Value;
    }
  }

  return attributes;
}

function resolveVariantImageUrls(
  attributes: Record<string, string>,
  variation: EbayVariation,
  listingImageUrls: string[],
  variationPictures?: VariationPicture[]
): string[] | null {
  const variantValue = Object.values(attributes)[0];
  const variantPicture = variationPictures?.find(
    (pic) => pic.VariationSpecificValue === variantValue
  );

  if (variantPicture?.PictureURL) {
    const urls = variantPicture.PictureURL;
    return Array.isArray(urls) ? urls : [urls];
  }

  // PictureURL exists in the real API but is missing from ebay-api SDK types
  const productDetails = variation.VariationProductListingDetails as
    | (Record<string, unknown> & { PictureURL?: string | string[] })
    | undefined;
  if (productDetails?.PictureURL) {
    const urls = productDetails.PictureURL;
    return Array.isArray(urls) ? urls : [urls];
  }

  // Fall back to listing's first image when no variant-specific picture exists
  const fallback = listingImageUrls[0];
  if (fallback) {
    return [fallback];
  }

  return null;
}

/**
 * Map eBay item variations to ListingVariant[]
 */
export function mapVariants(
  item: GetItemResponse["Item"],
  listingImageUrls: string[],
  variationPictures?: VariationPicture[]
): ListingVariant[] {
  const variations = item.Variations?.Variation;

  if (!(variations && Array.isArray(variations)) || variations.length === 0) {
    return [];
  }

  const { length, width, height, weight } = extractDimensionsAndWeight(item);

  return variations.map((variation) => {
    const attributes = parseAttributes(variation);

    const quantity = variation.Quantity || 0;
    const quantitySold = variation.SellingStatus?.QuantitySold || 0;
    const availableQuantity = Math.max(0, quantity - quantitySold);

    const priceValue =
      extractPrice(variation.SellingStatus?.CurrentPrice) ||
      extractPrice(variation.StartPrice) ||
      0;
    const price = Math.round(priceValue * 100);

    return {
      sku: variation.SKU || null,
      model: null,
      upc: null,
      ean: null,
      isbn: null,
      gtin: null,
      attributes: Object.keys(attributes).length > 0 ? attributes : null,
      price: price || 0,
      length: length ?? 0,
      width: width ?? 0,
      height: height ?? 0,
      weight: weight ?? 0,
      imageUrls: resolveVariantImageUrls(
        attributes,
        variation,
        listingImageUrls,
        variationPictures
      ),
      reference: generateVariantReference(item.ItemID, attributes),
      quantity: availableQuantity,
      sold: quantitySold,
    };
  });
}
