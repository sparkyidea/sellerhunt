/**
 * shop.app auth orchestrator — public entry for `getScanToken` in
 * `src/index.ts`. Prefers the cheap refresh-token grant when a cached token
 * is available; falls back to the `SignInAsGuest` get-new-token call on
 * rejection or when no refresh token is supplied.
 *
 * Imitating a real mobile-app session — real shop.app installs re-use their
 * refresh token until it dies (~30d). Re-running SignInAsGuest once per
 * access-token expiry would be ~24× the network noise of a real user, a
 * behavioral signal a sophisticated bot-detection layer can cluster on.
 */
import type { ScanTokenResult } from "../../../types";
import type { ShopCredentials } from "./get-new-token";
import { getNewToken } from "./get-new-token";
import { refreshToken } from "./refresh-token";

export type { ShopCredentials } from "./get-new-token";

export interface GetShopTokenInput {
  credentials: ShopCredentials;
  /** Decrypted refresh token from a prior get-new-token call, or null/undefined if none cached. */
  refreshToken?: string | null;
}

export async function getToken(
  input: GetShopTokenInput
): Promise<ScanTokenResult> {
  if (input.refreshToken) {
    try {
      return await refreshToken({
        ...input.credentials,
        refreshToken: input.refreshToken,
      });
    } catch {
      // Refresh rejected (expired / revoked / not-yet-implemented stub) —
      // fall through to get-new-token. That returns a fresh refresh token in
      // the result so the next derivation can try refresh again.
    }
  }
  return await getNewToken(input.credentials);
}
