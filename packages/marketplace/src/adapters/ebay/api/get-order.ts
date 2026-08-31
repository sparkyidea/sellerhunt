import type eBayApi from "ebay-api";
import type { Order } from "../../../types";
import { getApiErrorStatus } from "../../../utils/api-error";
import { mapOrder } from "./mapper/map-order";

/**
 * Fetch a single order by its eBay order id.
 *
 * Uses the Sell Fulfillment API:
 *   GET /sell/fulfillment/v1/order/{orderId}
 *
 * Returns null when the order doesn't exist (or isn't visible to this
 * seller) — webhook-driven syncs treat that as "nothing to do" rather than
 * an error, since a notification can outlive its order (e.g. cancellation).
 */
export async function getOrder(
  client: eBayApi,
  orderId: string
): Promise<Order | null> {
  try {
    const response = await client.sell.fulfillment.getOrder(orderId);
    return mapOrder(response);
  } catch (error: unknown) {
    // 404 only — a 400 means we sent a malformed id, which must surface rather
    // than look like "nothing to do".
    if (getApiErrorStatus(error) === 404) {
      return null;
    }
    throw error;
  }
}
