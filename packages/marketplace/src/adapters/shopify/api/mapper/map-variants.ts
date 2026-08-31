import type { ListingVariant } from "../../../../types";
import {
  extractDimensions,
  type ShopifyVariantMeasurement,
} from "../helper/extract-dimensions";
import { extractPriceCents } from "../helper/extract-price";
import { generateVariantReference } from "../helper/generate-variant-reference";

export interface ShopifyVariantNode {
  barcode: string | null;
  id: string;
  image: { altText: string | null; url: string } | null;
  inventoryItem: {
    id: string;
    measurement: ShopifyVariantMeasurement | null;
  } | null;
  inventoryQuantity: number | null;
  position: number;
  price: string;
  selectedOptions: Array<{ name: string; value: string }>;
  sku: string | null;
  title: string;
}

function buildAttributes(
  selectedOptions: Array<{ name: string; value: string }>
): Record<string, string> | null {
  if (selectedOptions.length === 0) {
    return null;
  }

  // Shopify gives every product a synthetic "Title=Default Title" option when the
  // seller hasn't defined real options. Strip it so single-variant products get
  // `attributes: null`, matching eBay's no-variation path.
  const filtered = selectedOptions.filter(
    (opt) => !(opt.name === "Title" && opt.value === "Default Title")
  );

  if (filtered.length === 0) {
    return null;
  }

  const attributes: Record<string, string> = {};
  for (const opt of filtered) {
    attributes[opt.name] = opt.value;
  }
  return attributes;
}

function pickVariantImage(
  variant: ShopifyVariantNode,
  productImageUrls: string[]
): string[] | null {
  if (variant.image?.url) {
    return [variant.image.url];
  }
  const fallback = productImageUrls[0];
  return fallback ? [fallback] : null;
}

export function mapVariants(
  productGid: string,
  variants: ShopifyVariantNode[],
  productImageUrls: string[]
): ListingVariant[] {
  if (variants.length === 0) {
    return [];
  }

  return variants.map((variant) => {
    const { length, width, height, weight } = extractDimensions(
      variant.inventoryItem?.measurement
    );
    const attributes = buildAttributes(variant.selectedOptions);
    const inventoryQuantity = Math.max(0, variant.inventoryQuantity ?? 0);

    return {
      sku: variant.sku || null,
      model: null,
      upc: null,
      ean: variant.barcode || null,
      isbn: null,
      gtin: null,
      attributes,
      price: extractPriceCents(variant.price),
      length,
      width,
      height,
      weight,
      imageUrls: pickVariantImage(variant, productImageUrls),
      reference: generateVariantReference(productGid, variant.id, variant.sku),
      quantity: inventoryQuantity,
      sold: 0,
    };
  });
}
