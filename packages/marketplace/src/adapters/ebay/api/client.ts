import type eBayApi from "ebay-api";
import type {
  ApiConfig,
  Channel,
  CreateShipmentPayload,
  CreateShipmentResult,
  CurrentToken,
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
import { refreshAccessToken } from "../auth/refresh-access-token";
import { createEbayApiClient } from "../create-ebay-client";
import {
  reconcileEbayChannelSubscriptions,
  removeEbayChannelSubscriptions,
} from "../notification/subscriptions";
import { createFulfillment } from "./create-fulfillment";
import { getChannel } from "./get-channel";
import { getFulfillments } from "./get-fulfillments";
import { getListings } from "./get-listings";
import { getOrder } from "./get-order";
import { getOrders } from "./get-orders";

/**
 * eBay API-ready adapter for marketplace operations
 * Handles authenticated API calls requiring access and refresh tokens
 */
export class EbayApiClient implements ApiClient {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private accessToken: string;
  private refreshToken: string;
  private accessTokenExpiresAt?: Date | null;
  private refreshTokenExpiresAt?: Date | null;
  private client: eBayApi;

  constructor(config: ApiConfig) {
    if (config.refreshToken === null) {
      throw new Error("eBay requires a refresh token");
    }
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.accessToken = config.accessToken;
    this.refreshToken = config.refreshToken;
    this.accessTokenExpiresAt = config.accessTokenExpiresAt;
    this.refreshTokenExpiresAt = config.refreshTokenExpiresAt;
    this.client = createEbayApiClient(
      this.clientId,
      this.clientSecret,
      this.accessToken,
      this.refreshToken
    );
  }

  async createFulfillment(
    orderId: string,
    payload: CreateShipmentPayload
  ): Promise<CreateShipmentResult> {
    return await createFulfillment(this.client, orderId, payload);
  }

  async getChannel(): Promise<Channel> {
    return await getChannel(this.client);
  }

  async getListings(
    options?: GetListingsOptions
  ): Promise<PageResult<Listing>> {
    return await getListings(this.client, options);
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
    if (!options.destinationId) {
      // eBay binds subscriptions to a destination object, not to a URL, so
      // there is nothing to point them at without one.
      throw new Error(
        "eBay requires a destinationId to reconcile subscriptions"
      );
    }
    return await reconcileEbayChannelSubscriptions(
      this.client,
      options.destinationId
    );
  }

  async removeAllSubscriptions(): Promise<SubscriptionResult[]> {
    return await removeEbayChannelSubscriptions(this.client);
  }

  async refresh(): Promise<TokenResponse> {
    const currentToken: CurrentToken = {
      accessToken: this.accessToken,
      refreshToken: this.refreshToken,
      accessTokenExpiresAt: this.accessTokenExpiresAt || null,
      refreshTokenExpiresAt: this.refreshTokenExpiresAt || null,
    };

    const response = await refreshAccessToken(
      this.clientId,
      this.clientSecret,
      currentToken
    );

    if (
      response.expiresIn === null ||
      response.refreshToken === null ||
      response.refreshTokenExpiresIn === null
    ) {
      throw new Error("eBay refresh response missing token expiry fields");
    }

    this.accessToken = response.accessToken;
    this.refreshToken = response.refreshToken;

    const now = new Date();
    this.accessTokenExpiresAt = new Date(
      now.getTime() + response.expiresIn * 1000
    );
    this.refreshTokenExpiresAt = new Date(
      now.getTime() + response.refreshTokenExpiresIn * 1000
    );

    // Recreate SDK client with new tokens
    this.client = createEbayApiClient(
      this.clientId,
      this.clientSecret,
      this.accessToken,
      this.refreshToken
    );

    return response;
  }
}
