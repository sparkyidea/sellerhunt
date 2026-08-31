/**
 * Public types for `@dashseller/marketplace`. Consumers import from
 * `@dashseller/marketplace/types`. Contract interfaces live in
 * `adapters/base.ts` and are re-exported here so this file is the
 * single import surface for callers.
 */
export type { ApiClient, AppClient, AuthClient } from "./adapters/base";

/**
 * Normalized listing status. Mirrors the `listing_status` Postgres enum in
 * `packages/db/src/schema/listing.ts`. Per-marketplace mapping lives in
 * `packages/marketplace/src/adapters/<marketplace>/enums.ts`; verbatim source
 * enums are documented in `packages/marketplace/docs/status-mapping.md`.
 */
export type ListingStatus =
  | "active"
  | "inactive"
  | "out_of_stock"
  | "draft"
  | "sold"
  | "ended";

/**
 * Normalized order status. Mirrors the `order_status` Postgres enum in
 * `packages/db/src/schema/order.ts`. Per-marketplace mapping lives in
 * `packages/marketplace/src/adapters/<marketplace>/enums.ts`.
 */
export type OrderStatus =
  | "pending"
  | "unfulfilled"
  | "partially_fulfilled"
  | "fulfilled"
  | "completed"
  | "canceled"
  | "returned"
  | "refunded";

/**
 * OAuth token response structure.
 *
 * `expiresIn`, `refreshToken`, and `refreshTokenExpiresIn` are nullable because
 * Shopify offline access tokens never expire and don't issue refresh tokens.
 * For DB storage, callers substitute sentinel values (`SENTINEL_NEVER_EXPIRES_AT`
 * for null timestamps, encrypted `SENTINEL_NO_REFRESH_TOKEN` for null refresh);
 * the DB columns remain NOT NULL.
 */
export interface TokenResponse {
  accessToken: string;
  expiresIn: number | null; // seconds
  refreshToken: string | null;
  refreshTokenExpiresIn: number | null; // seconds
  tokenType: string;
}

/**
 * Current token data from database
 */
export interface CurrentToken {
  accessToken: string;
  accessTokenExpiresAt: Date | null;
  refreshToken: string;
  refreshTokenExpiresAt: Date | null;
}

/**
 * Marketplace credentials from environment
 */
export interface MarketplaceCredentials {
  [key: string]: string | undefined;
}

/**
 * Marketplace user/seller information
 * Keys align with channel schema for direct DB insertion
 */
export interface Channel {
  displayName: string; // Display name (business name or username)
  reference: string; // Immutable marketplace user ID
}

/**
 * Base fields shared between Product and Listing
 */
interface ProductBase {
  brand: string | null;
  condition: string;
  conditionNote: string | null;
  description: string | null;
  imageUrls: string[] | null;
  manufacturer: string | null;
  title: string;
  variant: boolean;
}

/**
 * Product data structure - extends base with category assignment
 * Excludes: id, userId, archived, createdAt, updatedAt
 */
export interface Product extends ProductBase {
  categoryId: string | null;
}

/**
 * Product variant data structure - common fields shared with ListingVariant
 * Excludes: id, userId, productId, createdAt, updatedAt, unitCost
 */
export interface ProductVariant {
  attributes: Record<string, string> | null;
  ean: string | null;
  gtin: string | null;
  height: number;
  imageUrls: string[] | null;
  isbn: string | null;
  length: number;
  model: string | null;
  price: number;
  sku: string | null;
  upc: string | null;
  weight: number;
  width: number;
}

/**
 * Listing data structure - extends base with marketplace-specific fields
 * Category is resolved via marketplace_category table join, not stored on listing
 * Excludes: id, userId, productId, channelId, archived, createdAt, updatedAt
 */
export interface Listing extends ProductBase {
  descriptionHtml: string | null;
  domesticReturn: boolean;
  domesticReturnPaidBy: string | null;
  domesticReturnWindow: number | null;
  domesticShipping: boolean;
  domesticShippingAdditionalFee: number | null;
  domesticShippingBaseFee: number | null;
  domesticShippingType: string | null;
  duration: string | null;
  endedAt: Date | null;
  handlingFee: number | null;
  handlingTime: number;
  internationalReturn: boolean;
  internationalReturnPaidBy: string | null;
  internationalReturnWindow: number | null;
  internationalShipping: boolean;
  internationalShippingAdditionalFee: number | null;
  internationalShippingBaseFee: number | null;
  internationalShippingType: string | null;
  listingVariants: ListingVariant[];
  localPickup: boolean;
  marketplaceCategoryReference: string;
  /**
   * Provider-clock observation time of THIS snapshot's quantities, when the
   * marketplace supplies one (eBay: GetItem response `Timestamp`). Null
   * when the adapter has no observation clock (Shopify) — consumers fall
   * back to an app clock captured before the fetch. Used as the stock
   * seed cutoff so it's directly comparable to the same provider's order
   * clocks, eliminating cross-clock skew in the baseline rule.
   */
  observedAt: Date | null;
  offer: boolean | null;
  offerAcceptPrice: number | null;
  offerDeclinePrice: number | null;
  reference: string;
  restockingFee: number | null;
  /**
   * Provider version clock for stale-update/tombstone ordering. Shopify: the
   * product's `updatedAt` — a true modification clock. eBay: the GetItem
   * response `Timestamp` — an **observation** version (GetItem exposes no
   * modification time), comparable only against other eBay observations.
   * Null when the source response carried no usable clock.
   */
  sourceVersionAt: Date | null;
  startedAt: Date;
  status: ListingStatus;
  subTitle: string | null;
  type: string;
  url: string;
  viewCount: number | null;
  watchCount: number | null;
}

/**
 * Listing variant data structure - extends ProductVariant with listing-specific fields
 * Excludes: id, listingId, productVariantId, createdAt, updatedAt
 */
export interface ListingVariant extends ProductVariant {
  quantity: number;
  reference: string;
  sold: number;
}

/**
 * Order address structure — shared for billing and shipping
 */
export interface OrderAddress {
  address1: string | null;
  address2: string | null;
  city: string | null;
  company: string | null;
  countryCode: string | null;
  email: string | null;
  name: string | null;
  phone: string | null;
  state: string | null;
  zipCode: string | null;
}

/**
 * Order line item — individual item within an order
 * Excludes: id, orderId, productId, warehouseId, fulfillmentPriority, createdAt, updatedAt
 */
export interface OrderLine {
  /**
   * Current inventory-relevant quantity after edits and cancellations —
   * the target the stock derivation reconciles toward. Adapters derive it
   * from provider line-level data (Shopify `currentQuantity`; eBay: ordered
   * quantity, zeroed for unfulfilled lines of a canceled order). Line
   * effects are NEVER derived from order-level status; this field plus
   * cumulative fulfilled (see `deriveFulfilledQuantities`) carry all
   * inventory signal.
   */
  activeQuantity: number;
  discount: number | null; // cents
  /** Computed listing_variant.reference for variant matching during sync */
  listingVariantReference: string | null;
  /** Ordered/display quantity as originally placed. */
  quantity: number;
  reference: string; // marketplace line item ID
  sku: string | null;
  tax: number | null; // cents
  title: string | null;
  total: number | null; // cents
  unitPrice: number | null; // cents
}

/**
 * Order data structure — adapter transport shape.
 *
 * Most fields map directly to columns on the `order` DB table. Some fields
 * are **derived/passthrough**, not stored on the order itself: they exist
 * for the trigger's upsert logic to route into other tables (issue, shipment)
 * or for control flow (stock transactions, shipment-pull triggers).
 */
export interface Order {
  billing: OrderAddress;
  /**
   * Free-form cancellation reason from the marketplace. Used as `issue.reason`
   * when the trigger upserts a cancellation issue. **Not stored on the order
   * table.**
   */
  cancellationReason: string | null;
  /**
   * Marketplace cancellation lifecycle (e.g. eBay's `cancelStatus.cancelState`:
   * `NONE_REQUESTED` | `IN_PROGRESS` | `CANCELED`). Free-form string —
   * each adapter passes its own marketplace's value. Used by the trigger
   * to upsert an `issue` row of type `cancellation`. **Not stored on the
   * order table.**
   */
  cancelState: string | null;
  currency: string;
  customerNote: string | null;
  customerUsername: string | null;
  deliverBy: Date | null;
  deliveredAt: Date | null;
  discount: number | null; // cents
  orderedAt: Date | null;
  orderLines: OrderLine[];
  orderNumber: string | null;
  /**
   * Derived from marketplace payment status. Used by the trigger for stock
   * reservation / fulfillment logic. **Not stored on the order table** — derive
   * from `paidAt IS NOT NULL` for queries.
   */
  paid: boolean;
  paidAt: Date | null;
  paymentMethod: string | null;
  reference: string; // marketplace order ID
  requestedShippingCarrier: string | null;
  requestedShippingMethod: string | null;
  sellerNote: string | null;
  shipBy: Date | null;
  /**
   * Derived: at least one fulfillment exists for the order. Used by the
   * trigger to identify orders that need a shipment pull. **Not stored on
   * the order table** — derive from `status` or `shippedAt IS NOT NULL`.
   */
  shipped: boolean;
  shippedAt: Date | null;
  shipping: OrderAddress;
  shippingCost: number | null; // cents
  /**
   * Provider modification clock (eBay `lastModifiedDate`, Shopify
   * `updatedAt`) of this snapshot. Sync writes guard on it —
   * `WHERE source_version_at IS NULL OR source_version_at <= :incoming` —
   * so an out-of-order delivery can never overwrite fresher data. Never
   * compared against local clocks.
   */
  sourceVersionAt: Date | null;
  status: OrderStatus;
  subtotal: number | null; // cents
  tax: number | null; // cents
  total: number | null; // cents
}

/**
 * Base configuration shared by both auth and API clients
 */
interface BaseMarketplaceConfig {
  clientId: string;
  clientSecret: string;
}

/**
 * Configuration for creating an auth-only marketplace client
 * Used for OAuth authorization flow (generating auth URLs, exchanging codes)
 */
export interface AuthConfig extends BaseMarketplaceConfig {
  /** OAuth redirect URI - required for OAuth flow */
  redirectUri: string;
  /**
   * Storefront URL for marketplaces that scope OAuth per-shop (Shopify, Etsy
   * shops, etc.). Full URL form, e.g. `https://mystore.myshopify.com`. Unused
   * by marketplaces with global OAuth endpoints (eBay, Amazon).
   *
   * OAuth scopes are pinned per-adapter (see `<adapter>/auth/scopes.ts`),
   * not configured here.
   */
  shopUrl?: string;
}

/**
 * Configuration for creating an API-ready marketplace client
 * Used for marketplace API operations (fetching listings, channel info, etc.)
 *
 * `refreshToken` is nullable because some marketplaces (Shopify offline
 * access) do not issue refresh tokens.
 */
export interface ApiConfig extends BaseMarketplaceConfig {
  /** OAuth access token - required for API operations */
  accessToken: string;
  /** Optional: Access token expiration date */
  accessTokenExpiresAt?: Date | null;
  /** OAuth refresh token - null for marketplaces that don't issue one */
  refreshToken: string | null;
  /** Optional: Refresh token expiration date */
  refreshTokenExpiresAt?: Date | null;
  /**
   * Storefront URL for per-shop marketplaces (see AuthConfig.shopUrl).
   */
  shopUrl?: string;
}

/**
 * Configuration for creating an application-token client.
 *
 * App-scoped operations authenticate as our application, so there are no user
 * tokens and no redirect URI — just the developer-portal credential pair. The
 * marketplace SDK mints and caches the token itself; nothing is persisted.
 */
export type AppConfig = BaseMarketplaceConfig;

/**
 * Where a marketplace should deliver notifications. The delivery target is
 * app-scoped — one registration serves every channel — so this is an
 * {@link AppClient} concern, not a per-channel one.
 */
export interface ReconcileDestinationOptions {
  /**
   * Public URL of our receiver. Must byte-match what the marketplace has on
   * record — eBay folds it into the challenge hash.
   */
  endpoint: string;
  /** Name we register the delivery target under. */
  name: string;
  /** Shared secret registered alongside the endpoint. */
  verificationToken: string;
}

/**
 * Normalized inbound notification kind — the notification-side analogue of
 * {@link OrderStatus}. Per-marketplace topic mapping lives in
 * `packages/marketplace/src/adapters/<marketplace>/notification/enums.ts`, so
 * consumers switch on this and never learn a marketplace's topic vocabulary.
 *
 * Many-to-one is expected: eBay's BUYER_QUESTION and NEW_MESSAGE both collapse
 * into `message.received`, the same way its three order fields collapse into one
 * {@link OrderStatus}. `unknown` is for authentic deliveries on topics we don't
 * model — see {@link AppClient.verifyNotification}.
 */
export type NotificationEventType =
  | "order.created"
  | "order.updated"
  | "order.shipped"
  | "order.canceled"
  | "order.delivered"
  | "listing.created"
  | "listing.updated"
  | "listing.deleted"
  | "account.closed"
  | "authorization.revoked"
  | "message.received"
  | "feedback.received"
  | "unknown";

/**
 * A verified inbound notification, normalized. Attribution is returned as
 * candidate lists rather than a resolved channel because adapters have no
 * database access — the receiver matches them against `channel`.
 */
export interface NotificationEvent {
  /** Candidates for `channel.displayName`. Empty when the topic carries no seller identity. */
  channelNames: string[];
  /** Candidates for `channel.reference`, most-trusted first. */
  channelRefs: string[];
  eventType: NotificationEventType;
  /** Inbox idempotency key. Never empty — a delivery without one can't be mapped. */
  externalEventId: string;
  occurredAt: Date | null;
  /**
   * For every `order.*` event this is a marketplace ORDER id or null — never a
   * listing or fulfillment id, because it is fed straight to
   * {@link ApiClient.getOrder}. For `listing.*` events it is the marketplace
   * product/listing id the listings domain acts on.
   */
  resourceId: string | null;
  /** Raw marketplace topic, verbatim. Kept beside {@link eventType} for forensics. */
  topic: string;
}

/**
 * An inbound delivery exactly as received.
 */
export interface VerifyNotificationInput {
  /** Header names lower-cased, so adapters can index without re-normalizing. */
  headers: Record<string, string | undefined>;
  /**
   * The exact bytes received. Signatures are computed over these — parsing and
   * re-serializing before verification breaks it.
   */
  rawBody: string;
}

/**
 * A marketplace's synchronous endpoint-validation challenge.
 */
export interface AnswerChallengeInput {
  challengeCode: string;
  /**
   * The exact URL the marketplace requested. Folded into the answer, so a
   * trailing slash or scheme mismatch fails the registration.
   */
  endpoint: string;
  verificationToken: string;
}

/**
 * Outcome of reconciling one topic subscription. Reported per topic rather than
 * thrown so one unavailable topic can't abort a channel connect.
 */
export interface SubscriptionResult {
  destinationId?: string;
  error?: string;
  /** `unavailable` — topic not offered or not grantable to our keyset. */
  status: "enabled" | "error" | "removed" | "unavailable";
  subscriptionId?: string;
  /** Raw marketplace topic id. */
  topic: string;
}

/**
 * Where a channel's subscriptions should deliver.
 *
 * Both fields describe the same destination, differently: marketplaces that
 * model the callback URL as a separate app-scoped object bind subscriptions to
 * its id (eBay), while the rest carry the URL on each subscription (Shopify).
 * Callers pass both and let the adapter use what it needs.
 */
export interface ReconcileSubscriptionsOptions {
  /** App-scoped delivery target from {@link AppClient.reconcileDestination}. */
  destinationId?: string;
  /** Public URL of our receiver. */
  endpoint: string;
}

/**
 * Paginated response — adapter returns one page at a time.
 * Consumer passes cursor back to get the next page.
 * cursor = null means no more pages.
 */
export interface PageResult<T> {
  cursor: string | null;
  data: T[];
}

/**
 * Options for fetching listings from marketplace
 */
export interface GetListingsOptions {
  /** Opaque cursor from a previous PageResult — pass back to resume pagination */
  cursor?: string;
  /** Restrict to listings ending on/after this date (defaults to now) */
  endTimeFrom?: Date;
  /** Restrict to listings ending on/before this date (defaults to now + 90d) */
  endTimeTo?: Date;
  /** Only return listings modified after this timestamp (incremental sync) */
  modifiedSince?: Date;
  /** Filter by listing status (e.g., "ACTIVE", "ENDED", "SOLD") */
  status?: string;
}

/**
 * Options for fetching orders from marketplace
 */
export interface GetOrdersOptions {
  /** Opaque cursor from a previous PageResult — pass back to resume pagination */
  cursor?: string;
  /**
   * Only return orders **modified** after this date — both adapters filter on
   * last-modified (eBay `lastmodifieddate`, Shopify `updated_at`), not creation.
   * That's what makes an incremental pull pick up status changes on old orders.
   */
  since?: Date;
  /** Filter by order status */
  status?: string;
}

/**
 * Fulfillment data — normalized across marketplaces
 */
export interface ShippingFulfillment {
  /** Marketplace-specific carrier name */
  carrier: string | null;
  /**
   * Our outbox-row UUID as echoed back by the marketplace, when the
   * adapter passed one on create (via Idempotency-Key, client_request_id,
   * or similar) AND the marketplace surfaces it on the listing endpoint.
   * Null when the adapter doesn't support echo or the call wasn't ours.
   *
   * Populated in Phase 2 per adapter (Shopify first, eBay never). Phase 1
   * checks the field in the priority ladder but no adapter writes it yet.
   */
  clientReferenceId: string | null;
  /** Line items included in this fulfillment */
  lineItems: Array<{ lineItemId: string; quantity: number }>;
  /** Marketplace-specific shipping service/method (e.g. "USPSParcel") */
  method: string | null;
  /** Marketplace fulfillment ID */
  reference: string;
  /** ISO-8601 date when the shipment was created/shipped */
  shippedAt: string | null;
  /** Carrier tracking number */
  tracking: string | null;
}

/**
 * Payload for creating a fulfillment on a marketplace
 */
export interface CreateShipmentPayload {
  /** Marketplace-specific carrier code (e.g., "UPS", "USPS", "FedEx") */
  carrier: string;
  /**
   * Outbox row UUID for this push. Adapters that support it pass this
   * as an idempotency key / client reference on create so:
   *  - the marketplace dedups repeated creates from the same outbox row
   *  - the listing endpoint can echo it back (`clientReferenceId`) so
   *    reconciliation can correlate without depending on tracking
   *
   * Adapters that don't support either mechanism ignore this field.
   * Always populated by the caller in Phase 2+.
   */
  clientReferenceId?: string;
  /** Line items included in this fulfillment */
  lineItems: Array<{ lineItemId: string; quantity: number }>;
  /** Carrier tracking number */
  tracking: string;
}

/**
 * Result of creating a fulfillment on a marketplace
 */
export interface CreateShipmentResult {
  /** Marketplace-assigned fulfillment ID */
  fulfillmentId: string;
}

/**
 * Supported marketplace identifiers (lowercase to match database schema)
 */
export type MarketplaceType = "ebay" | "shopify" | "amazon";
