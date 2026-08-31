import type eBayApi from "ebay-api";
import { formatEbayPublicKey } from "../notification/verify-delivery";

/**
 * Notification public keys are long-lived and keyed by `kid`, so cache them
 * in-process — verifying every webhook must not cost an eBay round-trip.
 *
 * Module-level on purpose: clients are built per request, so an instance field
 * would make the cache useless.
 */
const publicKeyCache = new Map<string, string>();

/**
 * Fetch (and cache) the ECDSA public key eBay signed a notification with,
 * returned as a Node-crypto-ready PEM.
 *
 * `client` MUST be an application-token client — no seller context is involved
 * in signature verification.
 */
export async function getNotificationPublicKey(
  client: eBayApi,
  keyId: string
): Promise<string> {
  const cached = publicKeyCache.get(keyId);
  if (cached) {
    return cached;
  }

  const response = (await client.commerce.notification.getPublicKey(keyId)) as {
    key?: string;
  };
  if (!response.key) {
    throw new Error(`eBay getPublicKey returned no key for kid ${keyId}`);
  }

  const pem = formatEbayPublicKey(response.key);
  publicKeyCache.set(keyId, pem);
  return pem;
}
