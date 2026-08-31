import { describe, expect, it } from "vitest";
import { convertNotificationEventType } from "../enums";
import { EBAY_TOPICS } from "../topics";

describe("convertNotificationEventType", () => {
  it.each([
    ["ORDER_CONFIRMATION", "order.created"],
    ["ITEM_MARKED_SHIPPED", "order.shipped"],
    ["MARKETPLACE_ACCOUNT_DELETION", "account.closed"],
    ["AUTHORIZATION_REVOCATION", "authorization.revoked"],
    ["FEEDBACK_RECEIVED", "feedback.received"],
  ])("maps %s to %s", (topicId, eventType) => {
    expect(convertNotificationEventType(topicId)).toBe(eventType);
  });

  it("collapses both messaging topics onto message.received", () => {
    expect(convertNotificationEventType("BUYER_QUESTION")).toBe(
      "message.received"
    );
    expect(convertNotificationEventType("NEW_MESSAGE")).toBe(
      "message.received"
    );
  });

  it("covers every subscribed topic", () => {
    for (const spec of EBAY_TOPICS) {
      expect(convertNotificationEventType(spec.topicId)).toBe(spec.eventType);
      expect(convertNotificationEventType(spec.topicId)).not.toBe("unknown");
    }
  });

  it("reports unknown for topics outside our catalogue", () => {
    // An authentic delivery we don't model — not an error.
    expect(convertNotificationEventType("RETURN_CREATED")).toBe("unknown");
    expect(convertNotificationEventType("")).toBe("unknown");
  });
});
