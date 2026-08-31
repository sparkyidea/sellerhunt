/**
 * Sentinel timestamp used for marketplaces whose access or refresh tokens
 * never expire (e.g. Shopify offline access tokens). The DB columns are
 * NOT NULL, so callers persist this far-future date instead of `null`.
 */
export const SENTINEL_NEVER_EXPIRES_AT: Date = new Date("9999-12-31T23:59:59Z");

/**
 * Sentinel encrypted-plaintext value for marketplaces that don't issue a
 * refresh token. Stored encrypted in `channel_token.refresh_token` (which
 * is NOT NULL); decrypts back to the literal string `"none"`.
 */
export const SENTINEL_NO_REFRESH_TOKEN = "none" as const;

/**
 * Calculates expiration date from seconds
 * @param expiresIn - Seconds until expiration
 * @returns Date object representing expiration time
 */
export function calculateExpirationDate(expiresIn: number): Date {
  return new Date(Date.now() + expiresIn * 1000);
}

/**
 * Checks if a token is expired or will expire soon
 * @param expiresAt - Token expiration timestamp
 * @param bufferMinutes - Minutes before expiration to consider token expired (default: 5)
 * @returns True if token is expired or will expire within buffer time
 */
export function isTokenExpired(expiresAt: Date, bufferMinutes = 5): boolean {
  const now = new Date();
  const bufferMs = bufferMinutes * 60 * 1000;
  const expirationWithBuffer = new Date(expiresAt.getTime() - bufferMs);

  return now >= expirationWithBuffer;
}

/**
 * Generates a cryptographically secure random state string for CSRF protection
 * @param bytes - Number of random bytes to generate (default: 32)
 * @returns Random state string (hex encoded)
 */
export function generateState(bytes = 32): string {
  const randomBytes = new Uint8Array(bytes);
  crypto.getRandomValues(randomBytes);
  return Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
