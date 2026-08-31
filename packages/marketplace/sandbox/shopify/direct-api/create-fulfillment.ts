/**
 * Direct Shopify Admin GraphQL — exercises the two-step `fulfillmentCreateV2`
 * flow that PR-5's `createFulfillment()` adapter wraps:
 *
 *   1. Query `order(id).fulfillmentOrders` to find the open fulfillment-order
 *      and its per-line-item `id` (DIFFERENT from the order's `lineItem.id`).
 *   2. Mutation `fulfillmentCreateV2` with `lineItemsByFulfillmentOrder` —
 *      passing the fulfillment-order's line item IDs (NOT the order's).
 *
 * Re-keying is the trap: clients hold `lineItem.id` (from `getOrders`); the
 * mutation needs `fulfillmentOrderLineItem.id`. We join on `lineItem.id` to
 * map between them. Both response payloads are dumped for inspection.
 *
 * Required scopes: `read_merchant_managed_fulfillment_orders` +
 * `write_merchant_managed_fulfillment_orders`. If the channel was authorized
 * before these were added to `SHOPIFY_OAUTH_SCOPES`, the user must
 * disconnect + reconnect the channel before running this script — otherwise
 * `fulfillmentOrders` returns ACCESS_DENIED.
 *
 * Pass an order ID via ORDER_ID env var. Defaults to the first unfulfilled
 * order in the dev store if unset.
 *
 * Usage: ORDER_ID=gid://shopify/Order/123 bun run packages/marketplace/sandbox/shopify/direct-api/create-fulfillment.ts
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

const FULFILLMENT_ORDERS_QUERY = `#graphql
  query OrderFulfillmentOrders($id: ID!) {
    order(id: $id) {
      id
      name
      fulfillmentOrders(first: 10) {
        edges {
          node {
            id
            status
            requestStatus
            assignedLocation {
              location {
                id
                name
              }
            }
            lineItems(first: 50) {
              edges {
                node {
                  id
                  totalQuantity
                  remainingQuantity
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
    }
  }
`;

const FULFILLMENT_CREATE_MUTATION = `#graphql
  mutation FulfillmentCreate($fulfillment: FulfillmentV2Input!) {
    fulfillmentCreateV2(fulfillment: $fulfillment) {
      fulfillment {
        id
        status
        displayStatus
        createdAt
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
              }
            }
          }
        }
      }
      userErrors {
        field
        message
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

// --- Step 1: query fulfillmentOrders ---
console.log("Step 1: query fulfillmentOrders\n");
const foResponse = await client.request(FULFILLMENT_ORDERS_QUERY, {
  variables: { id: orderId },
});

const stepOnePath = fileURLToPath(
  new URL("./output/create-fulfillment-step1.json", import.meta.url)
);
await mkdir(dirname(stepOnePath), { recursive: true });
await writeFile(stepOnePath, JSON.stringify(foResponse, null, 2));

if (foResponse.errors) {
  console.error("Step 1 errors:", JSON.stringify(foResponse.errors, null, 2));
  console.error(
    "\n→ If this is ACCESS_DENIED, disconnect + reconnect the channel to grant the new fulfillment-order scopes."
  );
  process.exit(1);
}

interface FulfillmentOrdersData {
  order: {
    id: string;
    name: string;
    fulfillmentOrders: {
      edges: Array<{
        node: {
          id: string;
          status: string;
          requestStatus: string;
          assignedLocation: { location: { id: string; name: string } | null };
          lineItems: {
            edges: Array<{
              node: {
                id: string;
                totalQuantity: number;
                remainingQuantity: number;
                lineItem: { id: string; sku: string | null; title: string };
              };
            }>;
          };
        };
      }>;
    };
  } | null;
}

const foData = foResponse.data as FulfillmentOrdersData | undefined;
const openFo = foData?.order?.fulfillmentOrders.edges
  .map((e) => e.node)
  .find((fo) => fo.status === "OPEN" || fo.status === "IN_PROGRESS");

if (!openFo) {
  console.error("No OPEN/IN_PROGRESS fulfillment order found.");
  process.exit(1);
}

console.log(`Found open fulfillment order: ${openFo.id}`);
console.log("Line items (foLineItemId → lineItem.id):");
for (const li of openFo.lineItems.edges) {
  console.log(
    `  - ${li.node.id} → ${li.node.lineItem.id} (remaining=${li.node.remainingQuantity}/${li.node.totalQuantity}, sku=${li.node.lineItem.sku ?? "(none)"})`
  );
}

const linesWithRemaining = openFo.lineItems.edges
  .filter((e) => e.node.remainingQuantity > 0)
  .map((e) => ({
    id: e.node.id,
    quantity: e.node.remainingQuantity,
  }));

if (linesWithRemaining.length === 0) {
  console.error(
    "No remaining quantity to fulfill on the open fulfillment order."
  );
  process.exit(1);
}

// --- Step 2: fulfillmentCreateV2 ---
console.log("\nStep 2: fulfillmentCreateV2\n");
const fulfillmentInput = {
  notifyCustomer: false,
  trackingInfo: {
    company: "USPS",
    number: `SANDBOX-${Date.now()}`,
    url: "https://example.com/tracking",
  },
  lineItemsByFulfillmentOrder: [
    {
      fulfillmentOrderId: openFo.id,
      fulfillmentOrderLineItems: linesWithRemaining,
    },
  ],
};

console.log("Mutation input:");
console.log(JSON.stringify(fulfillmentInput, null, 2));

const createResponse = await client.request(FULFILLMENT_CREATE_MUTATION, {
  variables: { fulfillment: fulfillmentInput },
});

const stepTwoPath = fileURLToPath(
  new URL("./output/create-fulfillment-step2.json", import.meta.url)
);
await writeFile(stepTwoPath, JSON.stringify(createResponse, null, 2));

if (createResponse.errors) {
  console.error(
    "Step 2 errors:",
    JSON.stringify(createResponse.errors, null, 2)
  );
  process.exit(1);
}

interface CreateFulfillmentData {
  fulfillmentCreateV2: {
    fulfillment: { id: string; status: string; displayStatus: string } | null;
    userErrors: Array<{ field: string[]; message: string }>;
  };
}

const createData = createResponse.data as CreateFulfillmentData | undefined;
const result = createData?.fulfillmentCreateV2;
if (result?.userErrors.length) {
  console.error("\nuserErrors:", JSON.stringify(result.userErrors, null, 2));
  process.exit(1);
}

if (result?.fulfillment) {
  console.log(`\n✓ Created fulfillment: ${result.fulfillment.id}`);
  console.log(
    `  status=${result.fulfillment.status} displayStatus=${result.fulfillment.displayStatus}`
  );
}

process.exit(0);
