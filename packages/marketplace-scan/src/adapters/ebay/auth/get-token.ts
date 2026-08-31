/**
 * eBay auth orchestrator — public entry for `getScanToken` in
 * `src/index.ts`. eBay has no refresh-token grant in the `device_credentials`
 * flow, so this is currently a thin passthrough to `getNewToken`. Kept
 * symmetric with `shop/auth/get-token.ts` so the factory dispatcher's
 * per-adapter contract is uniform.
 */
import type { ScanTokenResult } from "../../../types";
import type { EbayCredentials } from "./get-new-token";
import { getNewToken } from "./get-new-token";

export type { EbayCredentials } from "./get-new-token";

export interface GetEbayTokenInput {
  credentials: EbayCredentials;
}

export function getToken(input: GetEbayTokenInput): Promise<ScanTokenResult> {
  return getNewToken(input.credentials);
}
