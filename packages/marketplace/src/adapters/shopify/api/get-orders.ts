import type { GetOrdersOptions, Order, PageResult } from "../../../types";
import type { ShopifyAdminClient } from "../create-shopify-client";
import { formatGraphQLError } from "./helper/format-graphql-error";
import { ORDER_FIELDS_FRAGMENT } from "./helper/order-fields";
import { mapOrder, type ShopifyOrderNode } from "./mapper/map-order";

const PAGE_SIZE = 50;

const ORDERS_QUERY = `#graphql
  query GetOrders($first: Int!, $after: String, $query: String) {
    orders(first: $first, after: $after, sortKey: PROCESSED_AT, reverse: true, query: $query) {
      edges {
        node {
          ...OrderFields
        }
      }
      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }
  ${ORDER_FIELDS_FRAGMENT}
`;

interface OrdersQueryData {
  orders: {
    edges: Array<{ node: ShopifyOrderNode }>;
    pageInfo: { endCursor: string | null; hasNextPage: boolean };
  };
}

/**
 * Fetch one page of orders from Shopify and map them to normalized
 * {@link Order}s. Cursor is Shopify's opaque base64 — pass it back through
 * `options.cursor` to resume.
 *
 * The query is sorted by `PROCESSED_AT desc` so the first page contains the
 * most recently paid orders — same shape as `pull-orders` expects.
 *
 * **Partial-data tolerance:** if Shopify returns `errors` AND `data`, we treat
 * the errors as warnings rather than throwing. The protected-customer-data
 * scope blocks PII fields (firstName, lastName, address1, etc.) without app
 * approval — every PII field generates a per-field error, but the rest of the
 * order is still returned. Throwing would block sync entirely; the address
 * mapper handles the resulting nulls.
 */
export async function getOrders(
  client: ShopifyAdminClient,
  options?: GetOrdersOptions
): Promise<PageResult<Order>> {
  const variables = {
    first: PAGE_SIZE,
    after: options?.cursor ?? null,
    query: options?.since ? `updated_at:>${options.since.toISOString()}` : null,
  };

  const response = await client.request<OrdersQueryData>(ORDERS_QUERY, {
    variables,
  });

  if (!response.data) {
    throw new Error(
      `Shopify orders query failed: ${formatGraphQLError(response.errors, "Unknown error")}`
    );
  }

  const { edges, pageInfo } = response.data.orders;
  const orders = edges.map((edge) => mapOrder(edge.node));

  return {
    data: orders,
    cursor: pageInfo.hasNextPage ? pageInfo.endCursor : null,
  };
}
