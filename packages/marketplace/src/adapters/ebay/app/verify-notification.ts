import type eBayApi from "ebay-api";
import type {
  NotificationEvent,
  VerifyNotificationInput,
} from "../../../types";
import { mapNotificationEvent } from "../notification/mapper/map-notification-event";
import type { EbayNotificationEnvelope } from "../notification/raw-types";
import {
  parseSignatureHeader,
  verifyNotificationSignature,
} from "../notification/verify-delivery";
import { getNotificationPublicKey } from "./get-notification-public-key";

/**
 * Verify an inbound eBay delivery against `x-ebay-signature` and normalize it.
 *
 * Null covers every inauthentic shape: no signature header, a malformed one, a
 * mismatch, or a body that isn't JSON. A failed key fetch THROWS instead —
 * "we couldn't check" and "this is forged" are different answers, and only the
 * first earns a redelivery.
 *
 * `client` MUST be an application-token client; no seller context is involved
 * in signature verification.
 */
export async function verifyNotification(
  client: eBayApi,
  input: VerifyNotificationInput
): Promise<NotificationEvent | null> {
  const header = input.headers["x-ebay-signature"];
  if (!header) {
    return null;
  }
  const signature = parseSignatureHeader(header);
  if (!signature) {
    return null;
  }

  const publicKeyPem = await getNotificationPublicKey(client, signature.kid);
  const verified = verifyNotificationSignature({
    rawBody: input.rawBody,
    publicKeyPem,
    signature: signature.signature,
  });
  if (!verified) {
    return null;
  }

  let envelope: EbayNotificationEnvelope;
  try {
    envelope = JSON.parse(input.rawBody) as EbayNotificationEnvelope;
  } catch {
    return null;
  }
  return mapNotificationEvent(envelope);
}
