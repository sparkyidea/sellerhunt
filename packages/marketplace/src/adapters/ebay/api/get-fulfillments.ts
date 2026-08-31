import type eBayApi from "ebay-api";
import type { ShippingFulfillment } from "../../../types";
import { getApiErrorStatus } from "../../../utils/api-error";
import {
  type EbayShippingFulfillment,
  mapFulfillment,
} from "./mapper/map-fulfillment";

/**
 * Fetch all fulfillments for an eBay order.
 *
 * Uses the Sell Fulfillment API:
 *   GET /sell/fulfillment/v1/order/{orderId}/shipping_fulfillment
 *
 * Returns an empty array when the order has no fulfillments or when eBay
 * responds with an error (e.g. 404 for unknown order IDs).
 */
export async function getFulfillments(
  client: eBayApi,
  orderId: string
): Promise<ShippingFulfillment[]> {
  try {
    const response =
      await client.sell.fulfillment.getShippingFulfillments(orderId);

    const fulfillments = response.fulfillments ?? [];

    return fulfillments.map((raw: unknown) =>
      mapFulfillment(raw as EbayShippingFulfillment)
    );
  } catch (error: unknown) {
    // Unknown order id — no fulfillments to report. A 400 means we sent
    // something malformed and must surface rather than read as "none".
    if (getApiErrorStatus(error) === 404) {
      return [];
    }
    throw error;
  }
}
