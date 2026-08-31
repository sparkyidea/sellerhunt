import type {
  NotificationEvent,
  VerifyNotificationInput,
} from "../../../types";
import { mapNotificationEvent } from "../notification/mapper/map-notification-event";
import { verifyShopifyWebhookHmac } from "../notification/verify-delivery";

/**
 * Verify an inbound Shopify delivery against `x-shopify-hmac-sha256` and
 * normalize it.
 *
 * Null means inauthentic and nothing else: a missing header or a digest
 * mismatch. Once the HMAC passes the delivery is Shopify's, so mapping never
 * refuses it — see {@link mapNotificationEvent} for why that matters more here
 * than on eBay.
 *
 * Synchronous, unlike eBay's: the secret is already in hand, where eBay has to
 * fetch a signing key over the network and therefore has a third answer
 * ("couldn't check") that must reach the caller as a throw.
 */
export function verifyNotification(
  clientSecret: string,
  input: VerifyNotificationInput
): NotificationEvent | null {
  const signature = input.headers["x-shopify-hmac-sha256"];
  if (!signature) {
    return null;
  }
  const verified = verifyShopifyWebhookHmac({
    clientSecret,
    rawBody: input.rawBody,
    signature,
  });
  return verified ? mapNotificationEvent(input) : null;
}
