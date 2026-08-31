/**
 * Shopify OAuth scopes required for dashseller's listing, order, inventory,
 * location, and fulfillment sync. Must stay in sync with the access scopes
 * declared in the Partner dashboard (`shopify.app.toml` →
 * `[access_scopes].scopes`).
 *
 * Defined as a const here (rather than an env var) because every dashseller
 * deployment needs the same scope set — diverging would mean some channels
 * silently can't sync. Mirrors the eBay pattern in
 * `packages/marketplace/src/adapters/ebay/create-ebay-client.ts`.
 *
 * Rule: CHN-001 — widening requires a reconnect campaign; batch additions.
 */
// Order matches what's configured in the Shopify Partner Dashboard so a
// future diff between code and dashboard is a one-line scan, not a sort.
// `read_merchant_managed_fulfillment_orders` + its write twin gate
// `order.fulfillmentOrders` queries and the `fulfillmentCreateV2` mutation —
// without them, `createFulfillment` errors with ACCESS_DENIED.
export const SHOPIFY_OAUTH_SCOPES = [
  "read_customers",
  "read_fulfillments",
  "write_fulfillments",
  "write_inventory",
  "read_inventory",
  "write_locations",
  "read_locations",
  "read_merchant_managed_fulfillment_orders",
  "write_merchant_managed_fulfillment_orders",
  "read_orders",
  "write_orders",
  "read_products",
  "write_products",
];
