import type {
  ApiConfig,
  Channel,
  CreateShipmentPayload,
  CreateShipmentResult,
  GetListingsOptions,
  GetOrdersOptions,
  Listing,
  Order,
  PageResult,
  ReconcileSubscriptionsOptions,
  ShippingFulfillment,
  SubscriptionResult,
  TokenResponse,
} from "../../../types";
import type { ApiClient } from "../../base";
import {
  createShopifyApiClient,
  type ShopifyAdminClient,
} from "../create-shopify-client";
import {
  reconcileShopifySubscriptions,
  removeShopifySubscriptions,
} from "../notification/subscriptions";
import { createFulfillment } from "./create-fulfillment";
import { getChannel } from "./get-channel";
import { getFulfillments } from "./get-fulfillments";
import { getListings } from "./get-listings";
import { getOrder } from "./get-order";
import { getOrders } from "./get-orders";

/**
 * Shopify API-ready adapter. Implements the `ApiClient` interface against the
 * Shopify Admin GraphQL API.
 *
 * Shopify offline access tokens never expire, so {@link refresh} is a no-op
 * that returns the existing token unchanged. The `refreshTokens` trigger job
 * naturally short-circuits via `isTokenExpired` against the
 * `9999-12-31` sentinel — this method is never invoked in production for
 * Shopify channels.
 */
export class ShopifyApiClient implements ApiClient {
  private readonly accessToken: string;
  private readonly shopUrl: string;
  private readonly client: ShopifyAdminClient;

  constructor(config: ApiConfig) {
    if (!config.shopUrl) {
      throw new Error("ShopifyApiClient requires a shopUrl");
    }
    this.accessToken = config.accessToken;
    this.shopUrl = config.shopUrl;
    this.client = createShopifyApiClient(this.shopUrl, this.accessToken);
  }

  async getChannel(): Promise<Channel> {
    return await getChannel(this.client);
  }

  async getListings(
    options?: GetListingsOptions
  ): Promise<PageResult<Listing>> {
    return await getListings(this.client, this.shopUrl, options);
  }

  async getOrder(orderId: string): Promise<Order | null> {
    return await getOrder(this.client, orderId);
  }

  async getOrders(options?: GetOrdersOptions): Promise<PageResult<Order>> {
    return await getOrders(this.client, options);
  }

  async getFulfillments(orderId: string): Promise<ShippingFulfillment[]> {
    return await getFulfillments(this.client, orderId);
  }

  async reconcileSubscriptions(
    options: ReconcileSubscriptionsOptions
  ): Promise<SubscriptionResult[]> {
    // `destinationId` is ignored: Shopify carries the callback URL on each
    // subscription, so there is no shared delivery object to bind to.
    return await reconcileShopifySubscriptions(this.client, options.endpoint);
  }

  async removeAllSubscriptions(): Promise<SubscriptionResult[]> {
    return await removeShopifySubscriptions(this.client);
  }

  async createFulfillment(
    orderId: string,
    payload: CreateShipmentPayload
  ): Promise<CreateShipmentResult> {
    return await createFulfillment(this.client, orderId, payload);
  }

  refresh(): Promise<TokenResponse> {
    // No-op: Shopify offline access tokens don't rotate. Return the existing
    // token unchanged with sentinel-shaped null expiry fields. The trigger's
    // `refreshTokens` job never reaches this path for Shopify channels because
    // the access-token expiry is a far-future sentinel.
    return Promise.resolve({
      accessToken: this.accessToken,
      expiresIn: null,
      refreshToken: null,
      refreshTokenExpiresIn: null,
      tokenType: "Bearer",
    });
  }
}
