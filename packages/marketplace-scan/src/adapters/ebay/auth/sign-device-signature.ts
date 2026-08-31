/**
 * eBay mobile-app device-signature signing.
 *
 * The iOS app signs the `deviceSignature` JSON with a per-device HMAC key
 * (HMAC-SHA512) and submits the signature as the `hmac` field in the
 * `/identity/v1/auth/app` request body. Without a valid signature eBay
 * rejects the auth call, so this is a hard dependency for minting bearers.
 *
 * Recipe (verified against a Frida-extracted CCHmac call on the live app):
 *
 *   hmac = base64( HMAC-SHA512( hmacKey, canonical(deviceSignature) ) )
 *
 * The canonical form is **byte-exact** — order of keys, lack of whitespace,
 * and `\/` escaping all matter. Use the helpers here, not `JSON.stringify`,
 * which makes no order/escape guarantees.
 *
 * Canonical form (matches eBay's iOS serialization):
 *   - Top-level keys ordered: `identifiers`, then `timestamp`.
 *   - Identifier order fixed: `4pp`, `idfa`, `idfv`.
 *   - Inside each identifier: `key` then `value`.
 *   - No whitespace between tokens.
 *   - Forward slashes inside string values escaped as `\/`.
 *   - Timestamp ISO-8601 with millisecond precision and trailing `Z`
 *     (matches `Date.prototype.toISOString()`).
 *
 * The HMAC signs ONLY the deviceSignature object — not clientId, grantType,
 * or any other request field. The signing key is per-device (Frida-extracted
 * once per persona) and stored encrypted in `mobile_profile.credentials`.
 */
import { createHmac } from "node:crypto";

export interface SignDeviceSignatureOptions {
  /** Device attestation token (`4pp`). Forward slashes escaped during canonicalization. */
  device4pp: string;
  /** Hex-encoded per-device HMAC-SHA512 key. */
  hmacKey: string;
  /** Apple advertising identifier (UUID). */
  idfa: string;
  /** Apple vendor identifier (UUID). */
  idfv: string;
  /**
   * Optional timestamp override. When omitted, the current wall clock is used
   * with millisecond precision. Tests pass a fixed value to reproduce a
   * known-good signature.
   */
  timestampIso?: string;
}

export interface SignDeviceSignatureResult {
  /** Base64-encoded HMAC-SHA512 signature, ready to drop into `body.hmac`. */
  hmac: string;
  /** Timestamp that was actually signed — round-trip this into the request body. */
  timestampIso: string;
}

/**
 * Compute the HMAC-SHA512 signature over the canonical deviceSignature JSON.
 * Returns both the signature and the exact timestamp string the caller MUST
 * place into the request body — they're bound together.
 */
export function signDeviceSignature(
  options: SignDeviceSignatureOptions
): SignDeviceSignatureResult {
  const timestampIso = options.timestampIso ?? new Date().toISOString();
  const canonical = canonicalDeviceSignature({
    device4pp: options.device4pp,
    idfa: options.idfa,
    idfv: options.idfv,
    timestampIso,
  });
  const key = Buffer.from(options.hmacKey, "hex");
  const hmac = createHmac("sha512", key).update(canonical).digest("base64");
  return { hmac, timestampIso };
}

/**
 * Build the byte-exact canonical JSON of the deviceSignature object the iOS
 * app signs. Exposed for tests; production code goes through `signDeviceSignature`.
 */
export function canonicalDeviceSignature(opts: {
  device4pp: string;
  idfa: string;
  idfv: string;
  timestampIso: string;
}): string {
  const fppEscaped = opts.device4pp.replace(/\//g, "\\/");
  return (
    '{"identifiers":[' +
    `{"key":"4pp","value":"${fppEscaped}"},` +
    `{"key":"idfa","value":"${opts.idfa}"},` +
    `{"key":"idfv","value":"${opts.idfv}"}` +
    "]," +
    `"timestamp":"${opts.timestampIso}"` +
    "}"
  );
}
