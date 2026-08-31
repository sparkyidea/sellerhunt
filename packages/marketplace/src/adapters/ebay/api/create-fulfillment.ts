import { normalizeTracking } from "@dashseller/shipment-tracking/utils";
import type eBayApi from "ebay-api";
import type {
  CreateShipmentPayload,
  CreateShipmentResult,
} from "../../../types";

/**
 * Create a fulfillment for an eBay order.
 *
 * Uses the Sell Fulfillment API:
 *   POST /sell/fulfillment/v1/order/{orderId}/shipping_fulfillment
 *
 * eBay returns 201 with an empty body and the fulfillment ID in the
 * Location header. We temporarily enable `returnResponse` on the SDK
 * to access the full HTTP response and extract from the header.
 *
 * Tracking is canonicalized at the adapter boundary so the marketplace
 * stores the same form `mapFulfillment` will hand back on the read path
 * — the reconciliation `tracking_match` rung therefore matches without
 * the caller re-normalizing.
 */
export async function createFulfillment(
  client: eBayApi,
  orderId: string,
  payload: CreateShipmentPayload
): Promise<CreateShipmentResult> {
  const body = {
    lineItems: payload.lineItems.map((item) => ({
      lineItemId: item.lineItemId,
      quantity: item.quantity,
    })),
    shippingCarrierCode: payload.carrier,
    trackingNumber: normalizeTracking(payload.tracking) ?? payload.tracking,
  };

  // Enable returnResponse to get the full axios response with headers.
  // eBay's 201 response has an empty body — the fulfillment ID is only
  // in the Location header.
  const fulfillmentApi = client.sell.fulfillment;
  const apiConfig = (
    fulfillmentApi as unknown as { apiConfig: Record<string, unknown> }
  ).apiConfig;
  const prevReturnResponse = apiConfig.returnResponse;
  apiConfig.returnResponse = true;

  try {
    const response = await fulfillmentApi.createShippingFulfillment(
      orderId,
      body
    );

    const location: string | undefined = response?.headers?.location;
    const fulfillmentId = location
      ? extractFulfillmentIdFromLocation(location)
      : "";

    return { fulfillmentId };
  } finally {
    apiConfig.returnResponse = prevReturnResponse;
  }
}

/**
 * Extract the fulfillment ID from the Location header URL.
 * Format: https://api.ebay.com/.../shipping_fulfillment/{fulfillmentId}
 */
function extractFulfillmentIdFromLocation(location: string): string {
  const parts = location.split("/");
  return parts.at(-1) ?? "";
}
