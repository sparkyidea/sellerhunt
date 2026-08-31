/**
 * shop.app implementation of `ScanClient`. Pulls a fresh bearer from the
 * configured provider on every adapter call, threads the persona's device
 * fingerprint headers through, then delegates to the standalone functions
 * in this folder.
 *
 * PR1 only implements `getListing` (the unified shape). The other
 * marketplace-scoped methods (`getSeller`, `getSellerListings`,
 * `searchListings`) are pending follow-up unification — they throw rather
 * than silently return marketplace-specific shapes through the unified
 * interface.
 */

import type {
  ScanClient,
  ScanClientConfig,
  ScanGetListingOptions,
  ScanGetListingResult,
} from "../base";
import type { GetSellerOptions, GetSellerResult } from "../ebay/api/get-seller";
import type {
  GetSellerListingsOptions,
  GetSellerListingsResult,
} from "../ebay/api/get-seller-listings";
import type {
  SearchListingsOptions,
  SearchListingsResult,
} from "../ebay/api/search-listings";
import { getListing } from "./api/get-listing";
import type { ShopCredentials } from "./auth/get-new-token";

const NOT_IMPLEMENTED =
  "ShopScanClient: method not implemented in PR1 (unification pending follow-up)";

export class ShopScanClient implements ScanClient {
  private readonly config: ScanClientConfig;
  private readonly credentials: ShopCredentials;

  constructor(config: ScanClientConfig) {
    if (!("deviceIdHw" in config.credentials)) {
      throw new Error(
        "ShopScanClient requires shop credentials (deviceId, deviceIdHw, deviceName)"
      );
    }
    this.config = config;
    this.credentials = config.credentials;
  }

  getMarketplaceId(): string {
    return "shop";
  }

  async getListing(
    options: ScanGetListingOptions
  ): Promise<ScanGetListingResult> {
    const authToken = await this.config.getAuthToken();
    const result = await getListing({
      authToken,
      deviceId: this.credentials.deviceId,
      deviceIdHw: this.credentials.deviceIdHw,
      deviceName: this.credentials.deviceName,
      listingId: options.listingId,
    });
    return { listing: result.listing, raw: result.raw };
  }

  searchListings(
    _options: Omit<SearchListingsOptions, "authToken">
  ): Promise<SearchListingsResult> {
    return Promise.reject(new Error(NOT_IMPLEMENTED));
  }

  getSeller(
    _options: Omit<GetSellerOptions, "authToken">
  ): Promise<GetSellerResult> {
    return Promise.reject(new Error(NOT_IMPLEMENTED));
  }

  getSellerListings(
    _options: Omit<GetSellerListingsOptions, "authToken">
  ): Promise<GetSellerListingsResult> {
    return Promise.reject(new Error(NOT_IMPLEMENTED));
  }
}
