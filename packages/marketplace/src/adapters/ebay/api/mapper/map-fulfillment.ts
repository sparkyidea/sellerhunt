import { normalizeTracking } from "@dashseller/shipment-tracking/utils";
import type { components } from "ebay-api/lib/types/restful/specs/sell_fulfillment_v1_oas3.js";
import type { ShippingFulfillment } from "../../../../types";

type EbayShippingFulfillment = components["schemas"]["ShippingFulfillment"] & {
  /** Present in API response but missing from SDK types */
  shippingServiceCode?: string;
};

export type { EbayShippingFulfillment };

/**
 * Map eBay ShippingFulfillment to normalized shipment.
 *
 * Tracking is canonicalized at the adapter boundary so consumers can
 * compare `ShippingFulfillment.tracking` against locally-normalized
 * tracking strings without re-running the helper themselves.
 */
export function mapFulfillment(
  raw: EbayShippingFulfillment
): ShippingFulfillment {
  return {
    reference: raw.fulfillmentId ?? "",
    tracking: normalizeTracking(raw.shipmentTrackingNumber),
    carrier: raw.shippingCarrierCode ?? null,
    // eBay's createShippingFulfillment doesn't accept a client reference
    // and getOrder doesn't echo one. Permanent null for eBay.
    clientReferenceId: null,
    method: raw.shippingServiceCode ?? null,
    lineItems: (raw.lineItems ?? []).map((item) => ({
      lineItemId: item.lineItemId ?? "",
      quantity: item.quantity ?? 0,
    })),
    shippedAt: raw.shippedDate ?? null,
  };
}
