import { stripGid } from "../api/helper/strip-gid";
import type { ShopifyNotificationPayload } from "./raw-types";

/**
 * Who and what an inbound delivery is about, resolved from the headers and
 * payload alone (no database access).
 */
export interface ShopifyEventIdentity {
  /**
   * Always empty. The shop's display name appears in no delivery header and in
   * no payload field we'd trust — `app/uninstalled` carries a `name`, but it is
   * the merchant-editable storefront name, and matching on it would attribute
   * one shop's uninstall to another. The domain is a strong key, so we never
   * need a weak one.
   */
  channelNames: string[];
  /** Candidates for `channel.reference`. */
  channelRefs: string[];
  resourceId: string | null;
}

/**
 * `channel.reference` for a Shopify channel is the canonical storefront URL
 * (`mapChannel` prefixes `myshopifyDomain`), while `X-Shopify-Shop-Domain`
 * delivers the bare domain. Canonicalize here so the receiver compares like
 * with like.
 *
 * Every topic gets refs from the header, including topics we don't model: an
 * archived `ignored` row that knows which channel it belongs to is worth having,
 * and the header is present on every delivery regardless of topic.
 */
function toChannelRefs(shopDomain: string | null): string[] {
  return shopDomain ? [`https://${shopDomain.toLowerCase()}`] : [];
}

/**
 * Prefer `admin_graphql_api_id`: `Order.reference` is `stripGid(node.id)` on
 * the API path, so stripping the gid here yields the identical string by
 * construction. `id` is the REST-shaped fallback — a NUMBER, and one Shopify
 * could widen without warning.
 */
function extractOrderId(payload: ShopifyNotificationPayload): string | null {
  const gid = payload.admin_graphql_api_id;
  if (typeof gid === "string" && gid.length > 0) {
    return stripGid(gid);
  }
  if (typeof payload.id === "number") {
    return String(payload.id);
  }
  return typeof payload.id === "string" && payload.id.length > 0
    ? payload.id
    : null;
}

/** `app/uninstalled` delivers the shop object; the domain identifies it. */
function extractShopDomain(
  payload: ShopifyNotificationPayload,
  shopDomain: string | null
): string | null {
  const domain = payload.myshopify_domain;
  return (
    (typeof domain === "string" && domain.length > 0 ? domain : null) ??
    shopDomain
  );
}

// Product bodies carry the same identity pair (admin_graphql_api_id / id),
// so the order extractor applies verbatim.
const extractProductId = extractOrderId;

const RESOURCE_EXTRACTORS: Record<
  string,
  (
    payload: ShopifyNotificationPayload,
    shopDomain: string | null
  ) => string | null
> = {
  "app/uninstalled": extractShopDomain,
  "orders/cancelled": extractOrderId,
  "orders/create": extractOrderId,
  "orders/fulfilled": extractOrderId,
  "orders/updated": extractOrderId,
  "products/create": extractProductId,
  "products/delete": extractProductId,
  "products/update": extractProductId,
};

/**
 * Resolve channel candidates and a resource id for any topic.
 *
 * Topics outside our catalogue yield a null `resourceId` rather than a guess —
 * `resourceId` is fed straight to `getOrder` for `order.*` events, so an id of
 * the wrong entity is worse than none. They keep their channel refs.
 */
export function identifyShopifyEvent(
  topic: string,
  shopDomain: string | null,
  payload: ShopifyNotificationPayload
): ShopifyEventIdentity {
  return {
    channelNames: [],
    channelRefs: toChannelRefs(shopDomain),
    resourceId: RESOURCE_EXTRACTORS[topic]?.(payload, shopDomain) ?? null,
  };
}
