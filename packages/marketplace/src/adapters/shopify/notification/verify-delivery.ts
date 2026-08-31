import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify the HMAC on an inbound Shopify webhook delivery.
 *
 * Spec: https://shopify.dev/docs/apps/build/webhooks/subscribe/https#step-5-verify-the-webhook
 *
 * HMAC-SHA256 over the raw request body, keyed with the app's client secret,
 * base64-encoded, compared against `X-Shopify-Hmac-Sha256`.
 *
 * Deliberately NOT merged with {@link verifyShopifyHmac} in `auth/verify-hmac.ts`.
 * That one signs a sorted `key=value&…` query string and compares hex; this one
 * signs opaque body bytes and compares base64. Sharing an implementation would
 * mean a canonicalization bug in either flow silently weakens the other, which
 * is exactly the class of mistake signature verification exists to prevent.
 */
export function verifyShopifyWebhookHmac(args: {
  clientSecret: string;
  /**
   * The exact bytes received. Any parse/re-serialize round trip reorders keys
   * or reflows whitespace and breaks the digest.
   */
  rawBody: string;
  /** Base64 `X-Shopify-Hmac-Sha256` header value. */
  signature: string;
}): boolean {
  if (!args.signature) {
    return false;
  }

  const expected = createHmac("sha256", args.clientSecret)
    .update(args.rawBody, "utf8")
    .digest();
  const provided = Buffer.from(args.signature, "base64");

  // timingSafeEqual THROWS on mismatched lengths, and a wrong-length signature
  // (truncated, hex-encoded, or garbage that base64-decodes short) is exactly
  // what an attacker probing the receiver sends. Guard, don't catch.
  if (provided.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(expected, provided);
}
