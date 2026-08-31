/**
 * Get a fresh bearer for eBay's mobile API by replaying the iOS app's
 * `device_credentials` grant against `apisd.ebay.com/identity/v1/auth/app`.
 *
 * Internal — the public entry is `getToken` in `./get-token.ts`. eBay has no
 * refresh-token grant in this flow, so the orchestrator is currently a thin
 * passthrough to this function.
 *
 * The caller does NOT need to know the signing algorithm — `signDeviceSignature`
 * is invoked internally with the persona's hmac key. Each call signs a fresh
 * timestamp; eBay rejects replayed signatures.
 *
 * Failure routing follows the same `ScanRequestError` convention as the
 * data adapters:
 *   - 401/403 → device credentials are dead; mark the persona dead.
 *   - 429/5xx → transient; cooldown the persona but keep it active.
 */
import { ScanRequestError } from "../../../errors";
import type { ScanTokenResult } from "../../../types";
import { ebayFetch } from "../http";
import { signDeviceSignature } from "./sign-device-signature";

const APP_TOKEN_ENDPOINT = "https://apisd.ebay.com/identity/v1/auth/app";

/**
 * iOS app build/device descriptor fragment used in the `X-EBAY-C-ENDUSERCTX`
 * header. eBay accepts a wide range of values here; this string mirrors a
 * real iPhone XR / iOS 16.3 capture from the iOS app version 6.192.0.
 */
const ENDUSERCTX_USER_AGENT =
  "ebayUserAgent/eBayIOS;6.192.0;iOS;16.3;Apple;iPhone11_8;--;414x896;2.0";

/**
 * Default fallback for `expiresIn` when eBay returns a token without a
 * documented lifetime. Conservative — caller will refresh on 401 anyway.
 */
const DEFAULT_EXPIRES_IN_SECONDS = 60 * 60;

export interface EbayCredentials {
  /** eBay app client ID (e.g. "eBayInc80-..."). */
  clientId: string;
  /** Device attestation token (`4pp`). */
  device4pp: string;
  /** eBay-issued device ID. */
  deviceId: string;
  /** Session GUID for correlation/tracking headers. */
  guid: string;
  /** Hex-encoded per-device HMAC-SHA512 key. */
  hmacKey: string;
  /** Apple advertising identifier (UUID). */
  idfa: string;
  /** Apple vendor identifier (UUID). */
  idfv: string;
}

export async function getNewToken(
  credentials: EbayCredentials
): Promise<ScanTokenResult> {
  const { hmac, timestampIso } = signDeviceSignature({
    hmacKey: credentials.hmacKey,
    device4pp: credentials.device4pp,
    idfa: credentials.idfa,
    idfv: credentials.idfv,
  });

  const body = {
    grantType: "device_credentials",
    deviceId: credentials.deviceId,
    scopes: [],
    clientId: credentials.clientId,
    hmac,
    deviceSignature: {
      identifiers: [
        { key: "4pp", value: credentials.device4pp },
        { key: "idfa", value: credentials.idfa },
        { key: "idfv", value: credentials.idfv },
      ],
      timestamp: timestampIso,
    },
  };

  const raw = await ebayFetch<unknown>({
    endpoint: "ebay.get-new-token",
    method: "POST",
    url: APP_TOKEN_ENDPOINT,
    headers: {
      Accept: "application/json",
      Authorization: `APP ${credentials.clientId}`,
      "X-EBAY-4PP": credentials.device4pp,
      "X-EBAY-C-ENDUSERCTX": `deviceId=${credentials.deviceId},deviceIdType=IDREF,userAgent=${ENDUSERCTX_USER_AGENT}`,
      "X-EBAY-C-TRACKING": `devicetimestamp=${timestampIso},guid=${credentials.guid}`,
      "X-EBAY-C-CORRELATION-SESSION": `devicetimestamp=${timestampIso},si=${credentials.guid}`,
    },
    body,
  });

  const parsed = parseAppTokenResponse(raw);
  if (!parsed) {
    throw new ScanRequestError({
      endpoint: "ebay.get-new-token",
      message: `eBay get-new-token returned an unrecognized shape: ${JSON.stringify(raw).slice(0, 500)}`,
      status: 200,
      body: JSON.stringify(raw).slice(0, 500),
    });
  }

  const expiresAt = new Date(Date.now() + parsed.expiresInSeconds * 1000);
  return { accessToken: parsed.accessToken, expiresAt, raw };
}

/**
 * eBay's response is camelCase in the captures we have, but real-world
 * OAuth-style endpoints split between camelCase and snake_case; accept both
 * to absorb a silent shape rotation. Unknown shape → caller gets a clear
 * error including the truncated body.
 */
function parseAppTokenResponse(
  raw: unknown
): { accessToken: string; expiresInSeconds: number } | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  const accessToken =
    pickString(obj, "accessToken") ?? pickString(obj, "access_token");
  if (!accessToken) {
    return null;
  }
  const expiresInSeconds =
    pickNumber(obj, "expiresIn") ??
    pickNumber(obj, "expires_in") ??
    DEFAULT_EXPIRES_IN_SECONDS;
  return { accessToken, expiresInSeconds };
}

function pickString(
  obj: Record<string, unknown>,
  key: string
): string | undefined {
  const value = obj[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function pickNumber(
  obj: Record<string, unknown>,
  key: string
): number | undefined {
  const value = obj[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}
