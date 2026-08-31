/**
 * Direct Shopify Admin GraphQL — paginated `orders` query. Dumps the raw
 * response so we can confirm the field shapes the mapper depends on
 * (lineItems, addresses, displayFinancialStatus, displayFulfillmentStatus,
 * cancelledAt, cancelReason, totals, refunds).
 *
 * Usage: bun run packages/marketplace/sandbox/shopify/direct-api/get-orders.ts
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

const ORDERS_QUERY = `#graphql
  query Orders($first: Int!, $after: String) {
    orders(first: $first, after: $after, sortKey: PROCESSED_AT, reverse: true) {
      edges {
        cursor
        node {
          id
          name
          legacyResourceId
          email
          phone
          note
          processedAt
          createdAt
          updatedAt
          cancelledAt
          cancelReason
          closedAt
          displayFinancialStatus
          displayFulfillmentStatus
          currencyCode
          customer {
            id
            displayName
            email
          }
          paymentGatewayNames
          totalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          subtotalPriceSet {
            shopMoney {
              amount
            }
          }
          totalShippingPriceSet {
            shopMoney {
              amount
            }
          }
          totalTaxSet {
            shopMoney {
              amount
            }
          }
          totalDiscountsSet {
            shopMoney {
              amount
            }
          }
          shippingAddress {
            firstName
            lastName
            company
            address1
            address2
            city
            province
            provinceCode
            zip
            country
            countryCode
            phone
          }
          billingAddress {
            firstName
            lastName
            company
            address1
            address2
            city
            province
            provinceCode
            zip
            country
            countryCode
            phone
          }
          shippingLine {
            code
            title
            source
            carrierIdentifier
          }
          lineItems(first: 50) {
            edges {
              node {
                id
                title
                quantity
                sku
                variant {
                  id
                  product {
                    id
                  }
                }
                originalUnitPriceSet {
                  shopMoney {
                    amount
                  }
                }
                discountedUnitPriceSet {
                  shopMoney {
                    amount
                  }
                }
                originalTotalSet {
                  shopMoney {
                    amount
                  }
                }
                discountedTotalSet {
                  shopMoney {
                    amount
                  }
                }
                taxLines {
                  priceSet {
                    shopMoney {
                      amount
                    }
                  }
                }
              }
            }
          }
          fulfillments {
            id
            createdAt
            displayStatus
          }
          transactions {
            id
            kind
            status
            processedAt
            paymentDetails {
              ... on CardPaymentDetails {
                paymentMethodName
              }
            }
          }
        }
      }
      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }
`;

const creds = await getCredentials(channelId);
const client = createShopifyApiClient(creds.shopUrl, creds.accessToken);

console.log(`Calling orders query against ${creds.shopUrl}...\n`);

const response = await client.request(ORDERS_QUERY, {
  variables: { first: 5, after: null },
});

const outputFile = fileURLToPath(
  new URL("./output/get-orders.json", import.meta.url)
);
await mkdir(dirname(outputFile), { recursive: true });
await writeFile(outputFile, JSON.stringify(response, null, 2));

if (response.errors) {
  console.error("GraphQL errors:", JSON.stringify(response.errors, null, 2));
  process.exit(1);
}

interface OrdersResponse {
  orders: {
    edges: Array<{
      cursor: string;
      node: {
        id: string;
        name: string;
        displayFinancialStatus: string | null;
        displayFulfillmentStatus: string | null;
        cancelledAt: string | null;
        lineItems: { edges: Array<{ node: { id: string; title: string } }> };
      };
    }>;
    pageInfo: { endCursor: string | null; hasNextPage: boolean };
  };
}

const data = response.data as OrdersResponse | undefined;
if (data) {
  const edges = data.orders.edges;
  console.log(`\nOrders returned: ${edges.length}`);
  console.log(`hasNextPage: ${data.orders.pageInfo.hasNextPage}`);
  console.log(`endCursor: ${data.orders.pageInfo.endCursor ?? "(none)"}\n`);
  for (const edge of edges) {
    const lineCount = edge.node.lineItems.edges.length;
    console.log(
      `  - [${edge.node.id}] ${edge.node.name} (fin=${edge.node.displayFinancialStatus}, ful=${edge.node.displayFulfillmentStatus}, cancelled=${edge.node.cancelledAt ?? "no"}, ${lineCount} lines)`
    );
  }
}

process.exit(0);
