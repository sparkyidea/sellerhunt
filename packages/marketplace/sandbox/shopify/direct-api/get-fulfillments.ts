/**
 * Direct Shopify Admin GraphQL — `order(id).fulfillments`. This is the shape
 * `getFulfillments()` returns. Empty `[]` for unfulfilled orders.
 *
 * Scopes: `read_orders`, `read_fulfillments` — both already in
 * `SHOPIFY_OAUTH_SCOPES`. No re-authorization needed.
 *
 * Pass an order ID via ORDER_ID env var. Defaults to the first unfulfilled
 * order in the dev store if unset.
 *
 * Usage: ORDER_ID=gid://shopify/Order/123 bun run packages/marketplace/sandbox/shopify/direct-api/get-fulfillments.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createShopifyApiClient } from "../../../src/adapters/shopify/create-shopify-client";
import { getCredentials } from "../setup";

const channelId = process.env.SHOPIFY_CHANNEL_ID;
if (!channelId) {
  console.error(
    "Set SHOPIFY_CHANNEL_ID in sandbox/.env or pass via SHOPIFY_CHANNEL_ID=<id> bun run <this-file>"
  );
  process.exit(1);
}

const FULFILLMENTS_QUERY = `#graphql
  query OrderFulfillments($id: ID!) {
    order(id: $id) {
      id
      name
      displayFulfillmentStatus
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
        fulfillmentLineItems(first: 50) {
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

const creds = await getCredentials(channelId);
const client = createShopifyApiClient(creds.shopUrl, creds.accessToken);

let orderId = process.env.ORDER_ID;
if (!orderId) {
  const probe = await client.request<{
    orders: { edges: Array<{ node: { id: string; name: string } }> };
  }>(
    `query { orders(first: 1, query: "fulfillment_status:unshipped") { edges { node { id name } } } }`
  );
  orderId = probe.data?.orders.edges[0]?.node.id;
  if (!orderId) {
    console.error(
      "Could not find an unfulfilled order in the dev store. Set ORDER_ID explicitly."
    );
    process.exit(1);
  }
  console.log(
    `Using order: ${orderId} (${probe.data?.orders.edges[0]?.node.name})\n`
  );
}

const response = await client.request(FULFILLMENTS_QUERY, {
  variables: { id: orderId },
});

const outputFile = fileURLToPath(
  new URL("./output/get-fulfillments.json", import.meta.url)
);
await mkdir(dirname(outputFile), { recursive: true });
await writeFile(outputFile, JSON.stringify(response, null, 2));

if (response.errors) {
  console.error("GraphQL errors:", JSON.stringify(response.errors, null, 2));
}

interface FulfillmentsResponse {
  order: {
    id: string;
    name: string;
    displayFulfillmentStatus: string;
    fulfillments: Array<{
      id: string;
      displayStatus: string;
      trackingInfo: Array<{ number: string | null; company: string | null }>;
      fulfillmentLineItems: {
        edges: Array<{
          node: {
            id: string;
            quantity: number;
            lineItem: { id: string; sku: string | null };
          };
        }>;
      };
    }>;
  } | null;
}

const data = response.data as FulfillmentsResponse | undefined;
if (data?.order) {
  console.log(
    `Order: ${data.order.name} (${data.order.displayFulfillmentStatus})`
  );
  console.log(`Fulfillments: ${data.order.fulfillments.length}`);
  for (const f of data.order.fulfillments) {
    const tracking = f.trackingInfo[0];
    console.log(
      `  - [${f.id}] ${f.displayStatus} tracking=${tracking?.number ?? "(none)"} carrier=${tracking?.company ?? "(none)"} lines=${f.fulfillmentLineItems.edges.length}`
    );
  }
}

process.exit(0);
