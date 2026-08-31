import type { Channel } from "../../../../types";

/**
 * Shape of the Shopify `shop` GraphQL query response we depend on.
 * Codegen will replace this hand-typed shape in PR 3.
 */
export interface ShopifyShopInfo {
  id: string;
  myshopifyDomain: string;
  name: string;
  url: string;
}

/**
 * Map a Shopify Shop object to a normalized {@link Channel}.
 *
 * `Channel.reference` is the canonical storefront URL (`https://{shop}.myshopify.com`)
 * — this is the same value stored on `channel.reference` and used as the unique
 * identifier for the merchant's Shopify connection. UI deep-links to the store
 * read this field directly.
 */
export function mapChannel(shop: ShopifyShopInfo): Channel {
  // myshopifyDomain is bare (e.g. "mystore.myshopify.com"); canonicalize.
  const reference = `https://${shop.myshopifyDomain}`;
  return {
    displayName: shop.name,
    reference,
  };
}
