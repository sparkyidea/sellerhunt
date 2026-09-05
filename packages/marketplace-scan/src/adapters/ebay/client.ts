/**
 * eBay implementation of `ScanClient`. Pulls a fresh bearer from the
 * configured provider on every adapter call, then delegates to the
 * standalone functions in this folder.
 *
 * The standalone functions remain the source of truth for HTTP/parsing
 * logic — this class is just an instance binding for callers who want a
 * single handle instead of four imports.
 */
import type {
  ScanCapabilities,
  ScanClient,
  ScanClientConfig,
  ScanGetListingOptions,
  ScanGetListingResult,
} from "../base";
import { getListing } from "./api/get-listing";
import {
  type GetSellerOptions,
  type GetSellerResult,
  getSeller,
} from "./api/get-seller";
import {
  type GetSellerListingsOptions,
  type GetSellerListingsResult,
  getSellerListings,
} from "./api/get-seller-listings";
import {
  type SearchListingsOptions,
  type SearchListingsResult,
  searchListings,
} from "./api/search-listings";

export class EbayScanClient implements ScanClient {
  static readonly capabilities: ScanCapabilities = {
    keywordSearch: true,
    sellerCatalog: true,
  };

  private readonly config: ScanClientConfig;

  constructor(config: ScanClientConfig) {
    this.config = config;
  }

  getMarketplaceId(): string {
    return "ebay";
  }

  async searchListings(
    options: Omit<SearchListingsOptions, "authToken">
  ): Promise<SearchListingsResult> {
    const authToken = await this.config.getAuthToken();
    return await searchListings({ ...options, authToken });
  }

  async getSeller(
    options: Omit<GetSellerOptions, "authToken">
  ): Promise<GetSellerResult> {
    const authToken = await this.config.getAuthToken();
    return await getSeller({ ...options, authToken });
  }

  async getSellerListings(
    options: Omit<GetSellerListingsOptions, "authToken">
  ): Promise<GetSellerListingsResult> {
    const authToken = await this.config.getAuthToken();
    return await getSellerListings({ ...options, authToken });
  }

  async getListing(
    options: ScanGetListingOptions
  ): Promise<ScanGetListingResult> {
    const authToken = await this.config.getAuthToken();
    const result = await getListing({
      listingId: options.listingId,
      authToken,
    });
    return { listing: result.listing, raw: result.raw };
  }
}
