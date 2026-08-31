import { z } from "zod";
import type { ListingData } from "../../types";

export const ebayListingFormSchema = z.object({
  // Info
  title: z.string().min(1, "Title is required").max(500),
  subTitle: z.string().max(500),
  descriptionHtml: z.string().max(500_000),
  category: z
    .object({
      id: z.string(),
      fullName: z.string(),
    })
    .nullable(),
  condition: z.string().min(1, "Condition is required"),
  conditionNote: z.string(),
  duration: z.string(),
  imageUrls: z.array(z.url()).max(30),

  // Pricing (variant-level)
  price: z.number().int().min(0),
  quantity: z.number().int().min(0),

  // Offers
  offer: z.boolean(),
  offerAcceptPrice: z.number().int().min(0).nullable(),
  offerDeclinePrice: z.number().int().min(0).nullable(),

  // Specifics
  brand: z.string(),
  manufacturer: z.string(),

  // Shipping
  localPickup: z.boolean(),
  handlingTime: z.number().int().min(0),
  handlingFee: z.number().int().min(0).nullable(),
  domesticShipping: z.boolean(),
  domesticShippingType: z.string(),
  domesticShippingBaseFee: z.number().int().min(0).nullable(),
  domesticShippingAdditionalFee: z.number().int().min(0).nullable(),
  internationalShipping: z.boolean(),
  internationalShippingType: z.string(),
  internationalShippingBaseFee: z.number().int().min(0).nullable(),
  internationalShippingAdditionalFee: z.number().int().min(0).nullable(),

  // Returns
  domesticReturn: z.boolean(),
  domesticReturnWindow: z.number().int().min(0).nullable(),
  domesticReturnPaidBy: z.string().nullable(),
  internationalReturn: z.boolean(),
  internationalReturnWindow: z.number().int().min(0).nullable(),
  internationalReturnPaidBy: z.string().nullable(),
  restockingFee: z.number().int().min(0).nullable(),
});

export type EbayListingFormValues = z.infer<typeof ebayListingFormSchema>;

function getInfoDefaults(listing: ListingData) {
  return {
    title: listing.title,
    subTitle: listing.subTitle ?? "",
    descriptionHtml: listing.descriptionHtml ?? listing.description ?? "",
    category: listing.marketplaceCategory
      ? {
          id: listing.marketplaceCategory.reference,
          fullName:
            listing.marketplaceCategory.fullName ??
            listing.marketplaceCategory.name,
        }
      : null,
    condition: listing.condition,
    conditionNote: listing.conditionNote ?? "",
    duration: listing.duration ?? "",
    imageUrls: listing.imageUrls ?? [],
  };
}

function getPricingDefaults(listing: ListingData) {
  const variant = listing.listingVariants[0];
  return {
    price: variant?.price ?? 0,
    quantity: variant?.quantity ?? 0,
    offer: listing.offer ?? false,
    offerAcceptPrice: listing.offerAcceptPrice ?? null,
    offerDeclinePrice: listing.offerDeclinePrice ?? null,
    brand: listing.brand ?? "",
    manufacturer: listing.manufacturer ?? "",
  };
}

function getShippingDefaults(listing: ListingData) {
  return {
    localPickup: listing.localPickup,
    handlingTime: listing.handlingTime,
    handlingFee: listing.handlingFee ?? null,
    domesticShipping: listing.domesticShipping,
    domesticShippingType: listing.domesticShippingType ?? "",
    domesticShippingBaseFee: listing.domesticShippingBaseFee ?? null,
    domesticShippingAdditionalFee:
      listing.domesticShippingAdditionalFee ?? null,
    internationalShipping: listing.internationalShipping,
    internationalShippingType: listing.internationalShippingType ?? "",
    internationalShippingBaseFee: listing.internationalShippingBaseFee ?? null,
    internationalShippingAdditionalFee:
      listing.internationalShippingAdditionalFee ?? null,
  };
}

function getReturnDefaults(listing: ListingData) {
  return {
    domesticReturn: listing.domesticReturn,
    domesticReturnWindow: listing.domesticReturnWindow ?? null,
    domesticReturnPaidBy: listing.domesticReturnPaidBy ?? null,
    internationalReturn: listing.internationalReturn,
    internationalReturnWindow: listing.internationalReturnWindow ?? null,
    internationalReturnPaidBy: listing.internationalReturnPaidBy ?? null,
    restockingFee: listing.restockingFee ?? null,
  };
}

export function getEbayListingFormDefaults(
  listing: ListingData
): EbayListingFormValues {
  return {
    ...getInfoDefaults(listing),
    ...getPricingDefaults(listing),
    ...getShippingDefaults(listing),
    ...getReturnDefaults(listing),
  };
}

function buildShippingPayload(values: EbayListingFormValues) {
  return {
    localPickup: values.localPickup,
    handlingTime: values.handlingTime,
    handlingFee: values.handlingFee,
    domesticShipping: values.domesticShipping,
    domesticShippingType: values.domesticShipping
      ? values.domesticShippingType || null
      : null,
    domesticShippingBaseFee: values.domesticShipping
      ? values.domesticShippingBaseFee
      : null,
    domesticShippingAdditionalFee: values.domesticShipping
      ? values.domesticShippingAdditionalFee
      : null,
    internationalShipping: values.internationalShipping,
    internationalShippingType: values.internationalShipping
      ? values.internationalShippingType || null
      : null,
    internationalShippingBaseFee: values.internationalShipping
      ? values.internationalShippingBaseFee
      : null,
    internationalShippingAdditionalFee: values.internationalShipping
      ? values.internationalShippingAdditionalFee
      : null,
  };
}

function buildReturnPayload(values: EbayListingFormValues) {
  return {
    domesticReturn: values.domesticReturn,
    domesticReturnWindow: values.domesticReturn
      ? values.domesticReturnWindow
      : null,
    domesticReturnPaidBy: values.domesticReturn
      ? values.domesticReturnPaidBy
      : null,
    internationalReturn: values.internationalReturn,
    internationalReturnWindow: values.internationalReturn
      ? values.internationalReturnWindow
      : null,
    internationalReturnPaidBy: values.internationalReturn
      ? values.internationalReturnPaidBy
      : null,
    restockingFee: values.restockingFee,
  };
}

export function buildListingUpdatePayload(
  listingId: string,
  values: EbayListingFormValues,
  siteId: string | null
) {
  return {
    id: listingId,
    title: values.title,
    subTitle: values.subTitle || null,
    descriptionHtml: values.descriptionHtml || null,
    condition: values.condition,
    conditionNote: values.conditionNote || null,
    duration: values.duration || null,
    imageUrls: values.imageUrls,
    marketplaceCategoryReference: values.category?.id ?? null,
    marketplaceCategorySiteId: siteId,
    brand: values.brand || null,
    manufacturer: values.manufacturer || null,
    offer: values.offer,
    offerAcceptPrice: values.offer ? values.offerAcceptPrice : null,
    offerDeclinePrice: values.offer ? values.offerDeclinePrice : null,
    ...buildShippingPayload(values),
    ...buildReturnPayload(values),
  };
}
