import { createHash } from "node:crypto";
import type {
  NotificationEvent,
  VerifyNotificationInput,
} from "../../../../types";
import { convertNotificationEventType } from "../enums";
import { identifyShopifyEvent } from "../identify";
import type { ShopifyNotificationPayload } from "../raw-types";

function parsePayload(rawBody: string): ShopifyNotificationPayload | null {
  try {
    const parsed: unknown = JSON.parse(rawBody);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as ShopifyNotificationPayload)
      : null;
  } catch {
    return null;
  }
}

/**
 * `externalEventId` is non-optional and backs the
 * `(marketplace_id, external_event_id)` idempotency index, so it can't be left
 * empty. `x-shopify-webhook-id` is stable across Shopify's retries of one
 * delivery, which is the dedup we actually need; `x-shopify-event-id` is the
 * documented companion.
 *
 * Hashing the body is the last resort. A delivery with neither header already
 * made header-based dedup impossible, and Shopify's retries resend byte-identical
 * bodies — so the hash still collapses exactly the duplicates that occur in
 * practice, and at worst it collapses two genuinely identical events we could
 * not have told apart anyway.
 */
function resolveExternalEventId(input: VerifyNotificationInput): string {
  return (
    input.headers["x-shopify-webhook-id"] ??
    input.headers["x-shopify-event-id"] ??
    createHash("sha256").update(input.rawBody, "utf8").digest("hex")
  );
}

function parseTriggeredAt(raw: string | undefined): Date | null {
  if (!raw) {
    return null;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Normalize a verified Shopify delivery.
 *
 * **Never returns null**, unlike eBay's mapper. This runs only after the HMAC
 * has passed, so the delivery is authentic by definition, and Shopify DELETES
 * an API-created subscription after 8 consecutive failed deliveries — rejecting
 * bodies we merely failed to understand is a slow, silent way to unsubscribe
 * ourselves. Everything the receiver needs (topic, idempotency key, shop) lives
 * in headers, so an unreadable body still produces a usable row.
 *
 * A body that doesn't parse is downgraded to `eventType: "unknown"` rather than
 * kept at its header topic: a handler woken for `order.created` with no
 * `resourceId` has nothing to act on, whereas an archived `unknown` keeps the
 * payload for inspection. (Post-HMAC this shouldn't be reachable at all.)
 */
export function mapNotificationEvent(
  input: VerifyNotificationInput
): NotificationEvent {
  const topic = input.headers["x-shopify-topic"] ?? "";
  const shopDomain = input.headers["x-shopify-shop-domain"] ?? null;
  const payload = parsePayload(input.rawBody);
  const identity = identifyShopifyEvent(topic, shopDomain, payload ?? {});

  return {
    channelNames: identity.channelNames,
    channelRefs: identity.channelRefs,
    eventType: payload ? convertNotificationEventType(topic) : "unknown",
    externalEventId: resolveExternalEventId(input),
    occurredAt: parseTriggeredAt(input.headers["x-shopify-triggered-at"]),
    resourceId: identity.resourceId,
    topic,
  };
}
