import { normalizeTracking } from "@dashseller/shipment-tracking/utils";
import type { ShippingFulfillment } from "../../../../types";
import { stripGid } from "../helper/strip-gid";

export interface ShopifyFulfillmentLineItem {
  id: string;
  lineItem: { id: string; sku: string | null; title: string };
  quantity: number;
}

export interface ShopifyFulfillmentNode {
  createdAt: string;
  deliveredAt: string | null;
  displayStatus: string | null;
  estimatedDeliveryAt: string | null;
  fulfillmentLineItems: { edges: Array<{ node: ShopifyFulfillmentLineItem }> };
  id: string;
  inTransitAt: string | null;
  legacyResourceId: string | null;
  status: string | null;
  trackingInfo: Array<{
    company: string | null;
    number: string | null;
    url: string | null;
  }>;
  updatedAt: string | null;
}

/**
 * Map a Shopify Fulfillment to a normalized {@link ShippingFulfillment}.
 *
 * Shopify exposes one carrier+tracking pair per fulfillment in the common case
 * (a single shipment); split shipments carry multiple `trackingInfo` entries.
 * We surface only the first — the trigger's shipment table represents one
 * fulfillment as one row, matching eBay's behavior.
 *
 * `lineItems[].lineItemId` is the underlying order `lineItem.id` (NOT the
 * `fulfillmentLineItem.id`), matching the eBay convention so the trigger can
 * join shipment line items to order line items by `reference`.
 *
 * Tracking is canonicalized at the adapter boundary so consumers can
 * compare `ShippingFulfillment.tracking` against locally-normalized
 * tracking strings without re-running the helper themselves.
 */
export function mapFulfillment(
  node: ShopifyFulfillmentNode
): ShippingFulfillment {
  const tracking = node.trackingInfo[0];
  return {
    reference: stripGid(node.id),
    tracking: normalizeTracking(tracking?.number),
    carrier: tracking?.company ?? null,
    clientReferenceId: null,
    method: null,
    lineItems: node.fulfillmentLineItems.edges.map((edge) => ({
      lineItemId: stripGid(edge.node.lineItem.id),
      quantity: edge.node.quantity,
    })),
    shippedAt: node.createdAt,
  };
}
