/**
 * Direct Shopify Admin GraphQL call — paginated `products` query.
 * Dumps the raw response so we can lock in the field shapes the mapper
 * will depend on (status, variants, images, inventory, weight).
 *
 * Usage: bun run packages/marketplace/sandbox/shopify/direct-api/get-products.ts
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

const PRODUCTS_QUERY = `#graphql
  query Products($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      edges {
        cursor
        node {
          id
          title
          handle
          status
          totalInventory
          descriptionHtml
          vendor
          productType
          tags
          createdAt
          updatedAt
          publishedAt
          onlineStoreUrl
          category {
            id
            name
            fullName
          }
          images(first: 20) {
            edges {
              node {
                id
                url
                altText
              }
            }
          }
          variants(first: 100) {
            edges {
              node {
                id
                title
                sku
                barcode
                price
                compareAtPrice
                position
                selectedOptions {
                  name
                  value
                }
                inventoryQuantity
                inventoryItem {
                  id
                  measurement {
                    weight {
                      value
                      unit
                    }
                  }
                }
                image {
                  url
                  altText
                }
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

console.log(`Calling products query against ${creds.shopUrl}...\n`);

const response = await client.request(PRODUCTS_QUERY, {
  variables: { first: 5, after: null },
});

const outputFile = fileURLToPath(
  new URL("./output/get-products.json", import.meta.url)
);
await mkdir(dirname(outputFile), { recursive: true });
await writeFile(outputFile, JSON.stringify(response, null, 2));

if (response.errors) {
  console.error("GraphQL errors:", JSON.stringify(response.errors, null, 2));
  process.exit(1);
}

interface ProductsResponse {
  products: {
    edges: Array<{
      cursor: string;
      node: {
        id: string;
        title: string;
        status: string;
        totalInventory: number | null;
        variants: {
          edges: Array<{ node: { id: string; sku: string | null } }>;
        };
      };
    }>;
    pageInfo: { endCursor: string | null; hasNextPage: boolean };
  };
}

const data = response.data as ProductsResponse | undefined;
if (data) {
  const edges = data.products.edges;
  console.log(`\nProducts returned: ${edges.length}`);
  console.log(`hasNextPage: ${data.products.pageInfo.hasNextPage}`);
  console.log(`endCursor: ${data.products.pageInfo.endCursor ?? "(none)"}\n`);
  for (const edge of edges) {
    const variantCount = edge.node.variants.edges.length;
    console.log(
      `  - [${edge.node.id}] ${edge.node.title} (${edge.node.status}, inv=${edge.node.totalInventory}, ${variantCount} variants)`
    );
  }
}

process.exit(0);
