/**
 * Get a fresh bearer for shop.app's mobile API by replaying the iOS app's
 * `SignInAsGuest` GraphQL mutation against `server.shop.app/graphql`.
 *
 * Internal — the public entry is `getToken` in `./get-token.ts`, which tries
 * the cheaper `refresh-token.ts` path first when a refresh token is cached.
 *
 * Output is a short-lived bearer + expiry; `refreshToken` is also returned
 * so the orchestrator can persist it for the next derivation.
 *
 * Failure routing follows the same `ScanRequestError` convention as eBay:
 *   - 401/403 → device persona is rejected; mark the persona dead.
 *   - 429/5xx → transient; cooldown the persona but keep it active.
 *   - GraphQL `userErrors` populated → routed as a synthetic 401 (the persona
 *     was rejected at the GraphQL layer despite a 200 HTTP response).
 *   - Top-level GraphQL `errors[]` → handled inside `shopGraphqlFetch` as 400.
 */
import { ScanRequestError } from "../../../errors";
import type { ScanTokenResult } from "../../../types";
import { type ShopGraphqlEnvelope, shopGraphqlFetch } from "../http";

const SIGN_IN_AS_GUEST_MUTATION = `mutation SignInAsGuest($medium: SignInMediumTypeEnum) {
  signInAsGuest(medium: $medium) {
    authPayload {
      accessToken
      refreshToken
      expiresIn
      __typename
    }
    userErrors {
      field
      message
      __typename
    }
    __typename
  }
}
`;

/**
 * Default fallback for `expiresIn` when shop.app returns a token without a
 * documented lifetime. Conservative — caller will refresh on 401 anyway.
 */
const DEFAULT_EXPIRES_IN_SECONDS = 60 * 60;

export interface ShopCredentials {
  /** Per-install UUID. Sent as `x-device-id`. */
  deviceId: string;
  /**
   * Hardware UUID (Apple uppercase format, e.g.
   * "3C47583A-5ECA-482F-9A08-35E86877924C"). Sent as `x-device-id-hw`.
   */
  deviceIdHw: string;
  /** Display name shown to shop.app (e.g. "Apple iPhone XR"). Sent as `x-device-name`. */
  deviceName: string;
}

interface SignInAsGuestData {
  signInAsGuest?: {
    authPayload?: {
      accessToken?: string;
      refreshToken?: string;
      expiresIn?: number;
    } | null;
    userErrors?: Array<{ message?: string }>;
  } | null;
}

export async function getNewToken(
  credentials: ShopCredentials
): Promise<ScanTokenResult> {
  const raw = await shopGraphqlFetch<ShopGraphqlEnvelope<SignInAsGuestData>>({
    endpoint: "shop.get-new-token",
    operationName: "SignInAsGuest",
    variables: { medium: "none" },
    query: SIGN_IN_AS_GUEST_MUTATION,
    headers: {
      // SignInAsGuest takes only the device-identity headers — no Bearer
      // (this IS the call that produces the bearer).
      "x-device-id": credentials.deviceId,
      "x-device-id-hw": credentials.deviceIdHw,
      "x-device-name": credentials.deviceName,
    },
  });

  const parsed = parseAppTokenResponse(raw);
  if (parsed.kind === "userError") {
    // GraphQL-layer rejection — treat as auth failure so the manager
    // re-routes through `markDead`/`markDataAuthFailure` like a real 401.
    throw new ScanRequestError({
      endpoint: "shop.get-new-token",
      message: `shop.app get-new-token userError: ${parsed.message}`,
      status: 401,
      body: JSON.stringify(raw).slice(0, 500),
    });
  }
  if (parsed.kind === "unknown") {
    throw new ScanRequestError({
      endpoint: "shop.get-new-token",
      message: `shop.app get-new-token returned an unrecognized shape: ${JSON.stringify(raw).slice(0, 500)}`,
      status: 200,
      body: JSON.stringify(raw).slice(0, 500),
    });
  }

  const expiresAt = new Date(Date.now() + parsed.expiresInSeconds * 1000);
  return {
    accessToken: parsed.accessToken,
    refreshToken: parsed.refreshToken,
    expiresAt,
    raw,
  };
}

type ParsedResponse =
  | {
      kind: "ok";
      accessToken: string;
      refreshToken: string;
      expiresInSeconds: number;
    }
  | { kind: "userError"; message: string }
  | { kind: "unknown" };

function parseAppTokenResponse(
  envelope: ShopGraphqlEnvelope<SignInAsGuestData>
): ParsedResponse {
  const block = envelope.data?.signInAsGuest;
  if (!block) {
    return { kind: "unknown" };
  }

  if (Array.isArray(block.userErrors) && block.userErrors.length > 0) {
    const message = block.userErrors[0]?.message ?? "shop.app userError";
    return { kind: "userError", message };
  }

  const ap = block.authPayload;
  if (!ap?.accessToken) {
    return { kind: "unknown" };
  }
  return {
    kind: "ok",
    accessToken: ap.accessToken,
    refreshToken: ap.refreshToken ?? "",
    expiresInSeconds: ap.expiresIn ?? DEFAULT_EXPIRES_IN_SECONDS,
  };
}
