/**
 * Refresh an existing shop.app bearer using a previously-issued refresh token
 * + the persona's device headers.
 *
 * Internal — the public entry is `getToken` in `./get-token.ts`, which calls
 * this first when a refresh token is cached and falls through to
 * `get-new-token.ts` on rejection. Preferred over getting a new token because
 * it imitates a real mobile-app session (real users renew, they don't re-run
 * SignInAsGuest).
 *
 * STUB — Pass 2 will wire this against the captured iOS-app GraphQL mutation
 * (likely `RefreshAccessToken` or similar) once the raw request is in hand.
 * Today it throws; the orchestrator catches and falls through to `getNewToken`,
 * so behavior is unchanged until Pass 2 lands.
 *
 * Failure routing follows the same `ScanRequestError` convention as the
 * new-token flow once implemented:
 *   - 401/403 → refresh token rejected; orchestrator falls through to new-token
 *   - 429/5xx → transient; orchestrator may still fall through to new-token
 */
import type { ScanTokenResult } from "../../../types";
import type { ShopCredentials } from "./get-new-token";

export interface RefreshTokenOptions extends ShopCredentials {
  /** Upstream-issued refresh token from a prior `getNewToken` call. */
  refreshToken: string;
}

export function refreshToken(
  _options: RefreshTokenOptions
): Promise<ScanTokenResult> {
  return Promise.reject(
    new Error(
      "shop.app refresh-token path is not yet implemented — capture the refresh GraphQL mutation from the iOS app and wire `refreshToken` (Pass 2). Orchestrator will fall back to SignInAsGuest get-new-token."
    )
  );
}
