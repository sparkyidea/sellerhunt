import type { Channel } from "../../../types";
import type { ShopifyAdminClient } from "../create-shopify-client";
import { mapChannel, type ShopifyShopInfo } from "./mapper/map-channel";

/**
 * Inline GraphQL query for the Shopify shop info. PR 3 will introduce
 * `@shopify/api-codegen-preset` codegen and replace this with typed operations.
 */
const SHOP_QUERY = `#graphql
  query ShopInfo {
    shop {
      id
      name
      myshopifyDomain
      url
    }
  }
`;

interface ShopQueryData {
  shop: ShopifyShopInfo;
}

/**
 * Fetch the seller's shop info from Shopify and map it to a normalized
 * {@link Channel}. Used during OAuth callback to populate `channel.displayName`
 * and `channel.reference` before persisting the row.
 */
export async function getChannel(client: ShopifyAdminClient): Promise<Channel> {
  const response = await client.request<ShopQueryData>(SHOP_QUERY);

  if (response.errors) {
    const message =
      response.errors.message ??
      response.errors.graphQLErrors?.[0]?.message ??
      "Unknown error";
    // `@shopify/graphql-client` never rejects on an HTTP error — it resolves
    // with `errors.networkStatusCode`. Carry it onto the thrown error so
    // callers can tell a dead grant (401) from a transient failure; without
    // it every Shopify failure looks equally ambiguous.
    const status = response.errors.networkStatusCode;
    throw Object.assign(
      new Error(`Shopify shop query failed: ${message}`),
      status === undefined ? {} : { statusCode: status }
    );
  }

  if (!response.data) {
    throw new Error("Shopify shop query returned no data");
  }

  return mapChannel(response.data.shop);
}
