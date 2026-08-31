import type { Order } from "../../../types";
import type { ShopifyAdminClient } from "../create-shopify-client";
import { formatGraphQLError } from "./helper/format-graphql-error";
import { ORDER_FIELDS_FRAGMENT } from "./helper/order-fields";
import { toGid } from "./helper/strip-gid";
import { mapOrder, type ShopifyOrderNode } from "./mapper/map-order";

const ORDER_QUERY = `#graphql
  query GetOrder($id: ID!) {
    order(id: $id) {
      ...OrderFields
    }
  }
  ${ORDER_FIELDS_FRAGMENT}
`;

interface OrderQueryData {
  order: ShopifyOrderNode | null;
}

/**
 * Fetch a single order by its marketplace order id — the stripped numeric form
 * carried by `Order.reference` and by webhook payloads. Returns null when the
 * order doesn't exist or isn't visible to this shop: a notification can outlive
 * its order, and webhook-driven syncs treat that as "nothing to do".
 *
 * **Partial-data tolerance:** gated on `!response.data`, deliberately NOT on
 * `response.errors`. Without protected-customer-data approval Shopify returns a
 * per-field error for every PII field AND the rest of the order — throwing on
 * `errors` would break sync entirely for every unapproved app, and the address
 * mapper already handles the resulting nulls. `get-orders.ts` makes the same
 * call for the same reason.
 */
export async function getOrder(
  client: ShopifyAdminClient,
  orderId: string
): Promise<Order | null> {
  const response = await client.request<OrderQueryData>(ORDER_QUERY, {
    variables: { id: toGid("Order", orderId) },
  });

  if (!response.data) {
    throw new Error(
      `Shopify order query failed: ${formatGraphQLError(response.errors, "Unknown error")}`
    );
  }

  return response.data.order ? mapOrder(response.data.order) : null;
}
