import type { NotificationEvent } from "../../../../types";
import { convertNotificationEventType } from "../enums";
import { identifyEbayEvent } from "../identify";
import { extractEbayShippedOrderId } from "../payloads/item-marked-shipped";
import { extractEbayOrderContext } from "../payloads/order-confirmation";
import type { EbayNotificationEnvelope } from "../raw-types";

/**
 * `identifyEbayEvent` resolves a resource id for tracing, and for
 * ITEM_MARKED_SHIPPED it falls back to `itemId` — a LISTING id — when the
 * payload carries no order id. `NotificationEvent.resourceId` is fed straight to
 * `getOrder`, so the order topics read their own narrow extractors and accept
 * null instead of a plausible-looking id for the wrong entity.
 */
function resolveResourceId(args: {
  data: Record<string, unknown>;
  tracingId: string | null;
  topic: string;
}): string | null {
  switch (args.topic) {
    case "ORDER_CONFIRMATION":
      return extractEbayOrderContext(args.data).orderId;
    case "ITEM_MARKED_SHIPPED":
      return extractEbayShippedOrderId(args.data);
    default:
      return args.tracingId;
  }
}

function parseEventDate(raw: string | undefined): Date | null {
  if (!raw) {
    return null;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Normalize an eBay notification envelope.
 *
 * Null means structurally unusable — no `notificationId` (the inbox idempotency
 * key) or no `metadata.topic`. A topic outside our catalogue is NOT that: it
 * maps fine and carries `eventType: "unknown"`.
 */
export function mapNotificationEvent(
  envelope: EbayNotificationEnvelope
): NotificationEvent | null {
  const externalEventId = envelope.notification?.notificationId;
  const topic = envelope.metadata?.topic;
  if (!(externalEventId && topic)) {
    return null;
  }

  const data = envelope.notification?.data ?? {};
  const identity = identifyEbayEvent(topic, data);

  return {
    channelNames: identity.channelNames,
    channelRefs: identity.channelRefs,
    eventType: convertNotificationEventType(topic),
    externalEventId,
    occurredAt: parseEventDate(envelope.notification?.eventDate),
    resourceId: resolveResourceId({
      data,
      tracingId: identity.resourceId,
      topic,
    }),
    topic,
  };
}
