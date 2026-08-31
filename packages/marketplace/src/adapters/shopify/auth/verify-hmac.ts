import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify the HMAC signature on a Shopify OAuth callback.
 *
 * Spec: https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant#step-2-verify-the-installation-request
 *
 * Steps:
 * 1. Remove the `hmac` (and legacy `signature`) param from the query.
 * 2. Sort remaining params alphabetically by key.
 * 3. Build a query string `key=value&key=value&...` (no URL-encoding adjustments).
 * 4. HMAC-SHA256 with the app's client secret.
 * 5. Constant-time compare against the provided hex `hmac`.
 *
 * Returns `true` if valid, `false` otherwise. The OAuth callback should reject
 * the request when this returns `false`.
 *
 * Not to be confused with `notification/verify-delivery.ts`, which verifies
 * webhook deliveries. Same primitive, different canonical message (sorted query
 * params vs. raw body) and different encoding (hex vs. base64) — folding them
 * together would let a canonicalization change in one flow quietly weaken the
 * other.
 */
export function verifyShopifyHmac(
  query: Record<string, string | undefined>,
  clientSecret: string
): boolean {
  const providedHmac = query.hmac;
  if (!providedHmac || typeof providedHmac !== "string") {
    return false;
  }

  // Build the canonical query string from all params except hmac/signature.
  const message = Object.keys(query)
    .filter((key) => key !== "hmac" && key !== "signature")
    .filter((key) => query[key] !== undefined)
    .sort()
    .map((key) => `${key}=${query[key] as string}`)
    .join("&");

  const expectedHex = createHmac("sha256", clientSecret)
    .update(message)
    .digest("hex");

  // Lengths must match for timingSafeEqual; otherwise short-circuit false.
  if (expectedHex.length !== providedHmac.length) {
    return false;
  }

  try {
    return timingSafeEqual(
      Buffer.from(expectedHex, "utf8"),
      Buffer.from(providedHmac, "utf8")
    );
  } catch {
    return false;
  }
}
