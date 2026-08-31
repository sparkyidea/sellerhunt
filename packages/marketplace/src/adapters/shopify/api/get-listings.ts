import type { GetListingsOptions, Listing, PageResult } from "../../../types";
import type { ShopifyAdminClient } from "../create-shopify-client";
import { mapListing, type ShopifyProductNode } from "./mapper/map-listing";

const PAGE_SIZE = 50;

/**
 * Single-page Shopify products query. We fetch products + their variants +
 * images in one round trip; pagination is via Shopify's native opaque
 * `pageInfo.endCursor` (base64). We pass that string back as our `PageResult.cursor`
 * unchanged.
 *
 * The eBay equivalent encodes a private `page:N` cursor; Shopify gives us a
 * cursor for free, so there is no need for the per-item second call eBay needs
 * (eBay's `GetSellerList` returns thin items, forcing a parallel `GetItem`
 * fan-out — Shopify's `products` query returns the full shape directly).
 */
const PRODUCTS_QUERY = `#graphql
  query GetListings($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query) {
      edges {
        node {
          id
          title
          handle
          status
          totalInventory
          descriptionHtml
          vendor
          productType
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

interface ProductsQueryData {
  products: {
    edges: Array<{ node: ShopifyProductNode }>;
    pageInfo: { endCursor: string | null; hasNextPage: boolean };
  };
}

/**
 * Fetch one page of products from Shopify and map them to normalized
 * {@link Listing}s. Cursor is Shopify's opaque base64 — pass it back through
 * `options.cursor` to resume.
 *
 * `options.modifiedSince` is rendered as Shopify's search query syntax
 * (`updated_at:>YYYY-MM-DD`); their search parser tolerates ISO timestamps.
 */
export async function getListings(
  client: ShopifyAdminClient,
  shopUrl: string,
  options?: GetListingsOptions
): Promise<PageResult<Listing>> {
  const variables = {
    first: PAGE_SIZE,
    after: options?.cursor ?? null,
    query: options?.modifiedSince
      ? `updated_at:>${options.modifiedSince.toISOString()}`
      : null,
  };

  const response = await client.request<ProductsQueryData>(PRODUCTS_QUERY, {
    variables,
  });

  if (response.errors) {
    const message =
      response.errors.message ??
      response.errors.graphQLErrors?.[0]?.message ??
      "Unknown error";
    throw new Error(`Shopify products query failed: ${message}`);
  }

  if (!response.data) {
    throw new Error("Shopify products query returned no data");
  }

  const { edges, pageInfo } = response.data.products;
  const listings = edges.map((edge) => mapListing(edge.node, { shopUrl }));

  return {
    data: listings,
    cursor: pageInfo.hasNextPage ? pageInfo.endCursor : null,
  };
}
