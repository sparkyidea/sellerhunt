import type { NotificationEventType } from "../../../types";
import { getEbayTopicSpec } from "./topics";

/**
 * The mapping table lives on {@link EBAY_TOPICS} rather than in a switch here,
 * so a topic can't be subscribed without also declaring what it means.
 *
 * Topics outside our catalogue — retired ids, ones eBay added, ones a stale
 * subscription still delivers — are `unknown` rather than an error: they're
 * authentic deliveries, just ones we don't model.
 */
export function convertNotificationEventType(
  topicId: string
): NotificationEventType {
  return getEbayTopicSpec(topicId)?.eventType ?? "unknown";
}
