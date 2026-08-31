/**
 * eBay OAuth scopes for seller operations: inventory, fulfillment, identity,
 * notification subscriptions, shipping, messaging, disputes and feedback.
 *
 * Pinned in code (not env) so every dashseller deployment requests the same
 * scope set — diverging would mean some channels silently can't sync. Mirrors
 * the Shopify pattern in `../../shopify/auth/scopes.ts`.
 *
 * Widening this breaks connected channels: the SDK sends the whole list on
 * token refresh, and eBay rejects scopes outside the original consent. Every
 * channel must reconnect, so batch additions.
 *
 * Rule: CHN-001 — a scope change is a reconnect migration, not an
 * incidental commit. The failure lands at eBay's token endpoint hours
 * after deploy, so nothing local catches it.
 */
export const EBAY_OAUTH_SCOPES = [
  "https://api.ebay.com/oauth/api_scope",
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
  "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly",
  "https://api.ebay.com/oauth/api_scope/commerce.notification.subscription",
  // Subscribed in notification/topics.ts; no handler yet.
  "https://api.ebay.com/oauth/api_scope/commerce.shipping",
  "https://api.ebay.com/oauth/api_scope/commerce.message",
  // Not used by any code yet — requested up front so building the feature
  // doesn't cost every channel another reconnect.
  "https://api.ebay.com/oauth/api_scope/sell.payment.dispute",
  "https://api.ebay.com/oauth/api_scope/commerce.feedback",
  // NOT grantable to this keyset — eBay's authorize endpoint rejects the whole
  // consent with invalid_scope, in read and write form alike (verified
  // 2026-08-04). They need access granted to the app first, so re-add only
  // after eBay approves, together with their topics:
  //   sell.listing.read  -> LISTING
  //   sell.cancellation  -> ORDER_CANCELLATION_ACTIVITY
  //   sell.return        -> ORDER_RETURN_ACTIVITY
  //   sell.inquiry       -> ORDER_INQUIRY_ACTIVITY
];
