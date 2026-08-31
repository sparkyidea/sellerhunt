/**
 * Webhook payload shapes, narrowed to the identity fields we actually read.
 *
 * Deliberately minimal: a delivery only tells us *which* resource changed, and
 * the worker re-fetches it through `getOrder` so the mapped order comes from
 * one code path. Modelling the full REST-shaped body here would be a second,
 * silently diverging copy of `mapOrder`.
 *
 * Webhook bodies are REST-shaped, not GraphQL-shaped: `id` is a NUMBER
 * (`5223452934372`), not a gid and not a string. Real ids sit well under 2^53,
 * so `String(id)` round-trips exactly — and if one ever didn't, `JSON.parse`
 * would have mangled it before we saw it, which is a second reason `identify.ts`
 * prefers the gid.
 */

/**
 * Body of `orders/*` and `products/*` — both deliver the same identity pair
 * (`admin_graphql_api_id` gid plus a REST-shaped numeric `id`).
 */
export interface ShopifyOrderWebhookPayload {
  /** `gid://shopify/Order/123` / `gid://shopify/Product/123` — the same value the API mappers derive from. */
  admin_graphql_api_id?: string;
  id?: number | string;
}

/** Body of `app/uninstalled` — the shop object itself. */
export interface ShopifyShopWebhookPayload {
  id?: number | string;
  myshopify_domain?: string;
}

/**
 * What the identity layer is handed: the topic isn't known to the type system
 * at the point the body is parsed, so it accepts every identity field any
 * modelled topic can carry and reads only the ones its topic owns.
 */
export type ShopifyNotificationPayload = ShopifyOrderWebhookPayload &
  ShopifyShopWebhookPayload;
