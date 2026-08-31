import type { NotificationEventType } from "../../../types";
import { getShopifyTopicSpec } from "./topics";

/**
 * The mapping table lives on {@link SHOPIFY_TOPICS} rather than in a switch
 * here, so a topic can't be subscribed without also declaring what it means.
 *
 * Topics outside our catalogue — a subscription left by an older version of
 * this app, or one a merchant created by hand — are `unknown` rather than an
 * error: they're authentic deliveries, just ones we don't model.
 */
export function convertNotificationEventType(
  topic: string
): NotificationEventType {
  return getShopifyTopicSpec(topic)?.eventType ?? "unknown";
}
