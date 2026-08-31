import { createVerify } from "node:crypto";

/**
 * ECDSA digest used by eBay's Event Notification Platform: the
 * X-EBAY-SIGNATURE payload is signed with the platform's EC key over a SHA-1
 * digest.
 *
 * eBay's official event-notification-nodejs-sdk spells this `ssl3-sha1`, but
 * that OpenSSL alias only exists on Node — Bun throws `Invalid digest:
 * ssl3-sha1`, and since the verify call is wrapped in a try/catch that would
 * silently reject every genuine notification. `sha1` is the portable spelling
 * and produces identical results: signatures created with `ssl3-sha1` verify
 * under `sha1` on both runtimes (the aliases differ only in SSLv3 MAC
 * handling, not in the digest itself).
 *
 * Rule: CHN-002 — do NOT "correct" this back to `ssl3-sha1` to match
 * vendor docs. The try/catch turns any throw into a silent drop: every
 * genuine notification discarded while the endpoint still returns 200.
 */
const SIGNATURE_ALGORITHM = "sha1";

/** Decoded shape of the base64 X-EBAY-SIGNATURE header. */
export interface EbaySignatureHeader {
  alg?: string;
  digest?: string;
  /** Public-key id — fetch the verification key via getPublicKey(kid). */
  kid: string;
  /** Base64 ECDSA signature over the notification body. */
  signature: string;
}

/**
 * Decode the base64 `x-ebay-signature` request header into its JSON parts.
 * Returns null on any malformed input — callers treat that as an invalid
 * (rejectable) request, not an error.
 */
export function parseSignatureHeader(
  header: string
): EbaySignatureHeader | null {
  try {
    const decoded = Buffer.from(header, "base64").toString("utf-8");
    const parsed: unknown = JSON.parse(decoded);
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }
    const candidate = parsed as Partial<EbaySignatureHeader>;
    if (
      typeof candidate.kid !== "string" ||
      typeof candidate.signature !== "string"
    ) {
      return null;
    }
    return candidate as EbaySignatureHeader;
  } catch {
    return null;
  }
}

/**
 * eBay's getPublicKey returns the PEM markers and key material on a single
 * line; Node's crypto requires newlines after BEGIN and before END.
 */
export function formatEbayPublicKey(key: string): string {
  return key
    .replace("-----BEGIN PUBLIC KEY-----", "-----BEGIN PUBLIC KEY-----\n")
    .replace("-----END PUBLIC KEY-----", "\n-----END PUBLIC KEY-----");
}

/**
 * Verify a notification body against the X-EBAY-SIGNATURE header.
 *
 * eBay signs the compact JSON message. We verify the raw body exactly as
 * received first; if that fails, retry against `JSON.stringify(JSON.parse(...))`
 * — eBay's own SDK verifies the re-stringified parsed message, so this
 * fallback covers any transport that re-flows whitespace.
 */
export function verifyNotificationSignature(args: {
  rawBody: string;
  /** PEM key already passed through {@link formatEbayPublicKey}. */
  publicKeyPem: string;
  /** Base64 signature from the decoded header. */
  signature: string;
}): boolean {
  const candidates = [args.rawBody];
  try {
    const restringified = JSON.stringify(JSON.parse(args.rawBody));
    if (restringified !== args.rawBody) {
      candidates.push(restringified);
    }
  } catch {
    // Non-JSON body: only the raw form can match.
  }

  for (const candidate of candidates) {
    try {
      const verifier = createVerify(SIGNATURE_ALGORITHM);
      verifier.update(candidate);
      if (verifier.verify(args.publicKeyPem, args.signature, "base64")) {
        return true;
      }
    } catch {
      // Malformed key/signature — fall through to return false.
    }
  }
  return false;
}
