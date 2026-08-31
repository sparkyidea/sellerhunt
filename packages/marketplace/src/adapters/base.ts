import type {
  AnswerChallengeInput,
  AppConfig,
  Channel,
  CreateShipmentPayload,
  CreateShipmentResult,
  GetListingsOptions,
  GetOrdersOptions,
  Listing,
  NotificationEvent,
  Order,
  PageResult,
  ReconcileDestinationOptions,
  ReconcileSubscriptionsOptions,
  ShippingFulfillment,
  SubscriptionResult,
  TokenResponse,
  VerifyNotificationInput,
} from "../types";

/**
 * Auth-only adapter interface for OAuth authorization flow
 * Used for generating auth URLs and exchanging authorization codes for tokens
 */
export interface AuthClient {
  /**
   * Exchange authorization code for access and refresh tokens
   * @param code - Authorization code from OAuth callback
   */
  exchangeCodeForTokens(code: string): Promise<TokenResponse>;

  /**
   * Generate OAuth authorization URL with optional state parameter
   * @param state - Optional CSRF protection state parameter (should be set and stored in cookies by caller)
   */
  generateAuthUrl(state?: string): string;
}

/**
 * API adapter interface for marketplace operations
 * Used for authenticated API calls requiring access and refresh tokens
 *
 * Paginated methods return PageResult<T> with an opaque cursor.
 * Pass the cursor back to get the next page. cursor = null means done.
 *
 * Usage with Trigger.dev (per-page retry + incremental DB writes):
 *   let cursor: string | null = null;
 *   do {
 *     const page = await client.getOrders({ cursor, since: lastSync });
 *     await db.insert(orders).values(page.data);
 *     cursor = page.cursor;
 *   } while (cursor);
 */
export interface ApiClient {
  /**
   * Create a fulfillment for an order on the marketplace.
   * Returns the marketplace-assigned fulfillment ID.
   */
  createFulfillment(
    orderId: string,
    payload: CreateShipmentPayload
  ): Promise<CreateShipmentResult>;
  /**
   * Get seller/store information from the marketplace
   */
  getChannel(): Promise<Channel>;

  /**
   * Fetch all fulfillments for an order.
   * Returns an empty array when the order has no fulfillments or does not exist.
   */
  getFulfillments(orderId: string): Promise<ShippingFulfillment[]>;

  /**
   * Fetch one page of listings. Pass cursor from previous result to get next page.
   */
  getListings(options?: GetListingsOptions): Promise<PageResult<Listing>>;

  /**
   * Fetch a single order by its marketplace order id. Returns null when the
   * order doesn't exist. Optional — webhook-driven targeted syncs
   * feature-detect it and fall back to a windowed getOrders pull.
   */
  getOrder?(orderId: string): Promise<Order | null>;

  /**
   * Fetch one page of orders. Pass cursor from previous result to get next page.
   */
  getOrders(options?: GetOrdersOptions): Promise<PageResult<Order>>;

  /**
   * Create or repair this channel's topic subscriptions and drop the ones we no
   * longer want. Idempotent — called at connect and re-run by the health cron.
   *
   * Seller-token work, which is why it lives here and not on {@link AppClient}:
   * a subscription is bound to the seller's grant. Optional because not every
   * marketplace exposes a subscription API — callers feature-detect.
   *
   * Returns a per-topic outcome instead of throwing, so one topic our keyset
   * can't have doesn't abort the rest of a connect.
   */
  reconcileSubscriptions?(
    options: ReconcileSubscriptionsOptions
  ): Promise<SubscriptionResult[]>;

  /**
   * Refresh expired access token using refresh token
   * Updates internal tokens and returns new token data for persistence
   */
  refresh(): Promise<TokenResponse>;

  /**
   * Delete every subscription this seller holds with our app, including topics
   * no longer in our catalogue.
   *
   * Must run before the channel's tokens are deleted — the cancellation
   * authenticates with them, and the marketplace keeps delivering otherwise.
   */
  removeAllSubscriptions?(): Promise<SubscriptionResult[]>;
}

/**
 * Application-token adapter interface for app-scoped operations.
 *
 * The third client role alongside {@link AuthClient} and {@link ApiClient}, and
 * the one with the smallest credential set: {@link AppConfig} is just the
 * developer-portal id/secret pair, because these operations authenticate as our
 * application rather than as any seller. Nothing per-channel, nothing to
 * refresh, nothing persisted — the marketplace SDK mints and caches the token.
 *
 * Everything here is infrastructure shared by every channel, which is exactly
 * why it can't hang off `ApiClient`: one delivery target and one signing-key
 * lookup serve the whole fleet.
 */
export interface AppClient {
  /**
   * Body the receiver's GET route answers an endpoint-validation challenge
   * with. Synchronous: the marketplace is holding a request open on the other
   * end of a destination registration.
   *
   * Optional because only marketplaces that prove an endpoint is ours before
   * delivering to it have a handshake at all. Absent means the receiver's GET
   * route 404s — nothing is listening for a challenge that never comes.
   */
  answerChallenge?(input: AnswerChallengeInput): Record<string, string>;

  /**
   * Topic ids subscribed per channel for this marketplace.
   *
   * Static metadata rather than an API call, but it belongs here because the
   * catalogue is the same for every seller, and because the decision of which
   * topics we opt into is the adapter's to make.
   *
   * Topics the marketplace registers once for the whole application (eBay's
   * developer-portal topics) are excluded: they are neither subscribed nor
   * cancelled per channel.
   */
  getSellerTopics(): string[];

  /**
   * Register (or repair) the delivery target for our webhook endpoint and
   * return its marketplace-assigned id. Idempotent.
   *
   * Registering or re-pointing a destination triggers the marketplace's
   * endpoint-validation challenge synchronously, so the receiver's challenge
   * route must already be live and reachable.
   *
   * Optional because only marketplaces that model the callback URL as a
   * separate app-scoped object have a destination to reconcile. Shopify sets
   * the URL per subscription, so the method is absent rather than a no-op stub
   * every caller would have to know returns nothing meaningful.
   */
  reconcileDestination?(options: ReconcileDestinationOptions): Promise<string>;

  /**
   * Verify an inbound delivery against its signature and normalize it.
   *
   * Returns null ONLY when the request is not authentic. An authentic delivery
   * on a topic we don't model returns `eventType: "unknown"` — never null —
   * because marketplaces redeliver a finite number of times, and spending those
   * attempts on an event we were always going to ignore is how a real event
   * behind it gets dropped.
   *
   * Throws when verification could not be performed at all (signing-key fetch
   * failed). Callers answer that with 5xx to earn a redelivery, and answer null
   * with a rejection.
   */
  verifyNotification(
    input: VerifyNotificationInput
  ): Promise<NotificationEvent | null>;
}
