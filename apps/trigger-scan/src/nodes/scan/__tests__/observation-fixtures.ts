import type {
  ScanListing,
  ScanListingVariant,
} from "@dashseller/marketplace-scan/types";

export function unit(
  overrides: Partial<ScanListingVariant> = {}
): ScanListingVariant {
  return {
    reference: "red",
    sku: null,
    attributes: { Color: "Red" },
    imageUrls: null,
    price: 2000,
    currency: "USD",
    model: null,
    mpn: null,
    upc: null,
    ean: null,
    isbn: null,
    gtin: null,
    status: "in_stock",
    ...overrides,
  };
}

export function listing(overrides: Partial<ScanListing> = {}): ScanListing {
  return {
    marketplace: "ebay",
    reference: "123456789012",
    title: "Camera",
    sellerReference: "seller-1",
    description: null,
    condition: "New",
    marketplaceCategoryReference: null,
    categoryPath: ["Cameras"],
    imageUrls: null,
    url: null,
    brand: null,
    manufacturer: null,
    specifics: null,
    type: null,
    startedAt: null,
    endedAt: null,
    itemSold: 200,
    soldLast24h: null,
    soldLast30Days: null,
    variants: [unit()],
    ...overrides,
  };
}
