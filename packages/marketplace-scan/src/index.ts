import type {
  ScanCapabilities,
  ScanClient,
  ScanClientConfig,
  ScanMarketplaceType,
} from "./adapters/base";
import {
  type GetEbayTokenInput,
  getToken as getEbayToken,
} from "./adapters/ebay/auth/get-token";
import { EbayScanClient } from "./adapters/ebay/client";
import {
  type GetShopTokenInput,
  getToken as getShopToken,
} from "./adapters/shop/auth/get-token";
import { ShopScanClient } from "./adapters/shop/client";
import type { ScanTokenResult } from "./types";

/**
 * Create a marketplace-scan client. Mirrors `createApiClient` from
 * `@dashseller/marketplace`, but for read-only research data (other people's
 * listings / sellers, via mobile-API endpoints).
 *
 * Types live at `@dashseller/marketplace-scan/types`.
 * Errors live at `@dashseller/marketplace-scan/errors`.
 *
 * Token derivation goes through `getScanToken` below — callers don't reach
 * into per-adapter mint/refresh files directly.
 *
 * @example
 *   const client = createScanClient("ebay", {
 *     getAuthToken: async () => bearer,
 *     credentials: ebayCredentials,
 *   });
 *   const { listing } = await client.getListing({ listingId: "136784592725" });
 */
export function createScanClient(
  marketplace: ScanMarketplaceType | string,
  config: ScanClientConfig
): ScanClient {
  const id = marketplace.toLowerCase();
  switch (id) {
    case "ebay":
      return new EbayScanClient(config);
    case "shop":
      return new ShopScanClient(config);
    default:
      throw new Error(`Unsupported scan marketplace: ${id}`);
  }
}

/**
 * Static capability lookup for a marketplace id: what the adapter behind
 * `createScanClient` actually implements. Crons use this to skip keyword and
 * seller sweeps for adapters that only serve listing detail (shop today).
 * Throws for unknown marketplaces, like `createScanClient`.
 */
export function getScanCapabilities(
  marketplace: ScanMarketplaceType | string
): ScanCapabilities {
  const id = marketplace.toLowerCase();
  switch (id) {
    case "ebay":
      return EbayScanClient.capabilities;
    case "shop":
      return ShopScanClient.capabilities;
    default:
      throw new Error(`Unsupported scan marketplace: ${id}`);
  }
}

/**
 * Discriminated input for `getScanToken`. Each branch carries everything the
 * adapter's orchestrator needs to derive a fresh bearer: the persona
 * credentials, plus any cached refresh token for adapters that support a
 * refresh grant (shop today; eBay never).
 */
export type ScanTokenInput =
  | ({ marketplace: "ebay" } & GetEbayTokenInput)
  | ({ marketplace: "shop" } & GetShopTokenInput);

/**
 * Token-derivation factory. Dispatches to the right per-adapter orchestrator
 * (`adapters/<provider>/auth/get-token.ts`), which internally decides between
 * refresh and mint. Caller (e.g. `MobileProfileTokenManager`) supplies
 * credentials + any cached refresh token; the orchestrator returns a valid
 * `ScanTokenResult` and the caller always persists.
 *
 * @example
 *   const result = await getScanToken({
 *     marketplace: "shop",
 *     credentials: { deviceId, deviceIdHw, deviceName },
 *     refreshToken: cachedRefreshToken,
 *   });
 *   await persistTokenResult(result);
 */
export function getScanToken(input: ScanTokenInput): Promise<ScanTokenResult> {
  switch (input.marketplace) {
    case "ebay":
      return getEbayToken(input);
    case "shop":
      return getShopToken(input);
    default: {
      const exhaustive: never = input;
      throw new Error(
        `Unsupported scan marketplace for token derivation: ${String((exhaustive as { marketplace: string }).marketplace)}`
      );
    }
  }
}
