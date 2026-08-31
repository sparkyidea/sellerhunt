import type { ShippingFulfillment } from "../../../types";
import type { ShopifyAdminClient } from "../create-shopify-client";
import { toGid } from "./helper/strip-gid";
import {
  mapFulfillment,
  type ShopifyFulfillmentNode,
} from "./mapper/map-fulfillment";

const FULFILLMENTS_QUERY = `#graphql
  query OrderFulfillments($id: ID!) {
    order(id: $id) {
      id
      fulfillments {
        id
        legacyResourceId
        status
        displayStatus
        createdAt
        updatedAt
        deliveredAt
        inTransitAt
        estimatedDeliveryAt
        trackingInfo {
          number
          url
          company
        }
        fulfillmentLineItems(first: 100) {
          edges {
            node {
              id
              quantity
              lineItem {
                id
                sku
                title
              }
            }
          }
        }
      }
    }
  }
`;

interface FulfillmentsQueryData {
  order: {
    id: string;
    fulfillments: ShopifyFulfillmentNode[];
  } | null;
}

/**
 * Fetch all fulfillments for a Shopify order. Returns `[]` when the order has
 * no fulfillments, when the order ID is unknown (Shopify returns
 * `order: null`), or when the request errors — matching the eBay adapter
 * which swallows 404/400 from the same shape.
 */
export async function getFulfillments(
  client: ShopifyAdminClient,
  orderId: string
): Promise<ShippingFulfillment[]> {
  const response = await client.request<FulfillmentsQueryData>(
    FULFILLMENTS_QUERY,
    { variables: { id: toGid("Order", orderId) } }
  );

  if (!response.data?.order) {
    return [];
  }

  return response.data.order.fulfillments.map(mapFulfillment);
}
