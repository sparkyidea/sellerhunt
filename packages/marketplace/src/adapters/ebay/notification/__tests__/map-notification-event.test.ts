import { describe, expect, it } from "vitest";
import { mapNotificationEvent } from "../mapper/map-notification-event";

/** Same real delivery the order-confirmation parser is pinned to (2026-08-01). */
const ORDER_CONFIRMATION = {
  metadata: { topic: "ORDER_CONFIRMATION", schemaVersion: "1.0" },
  notification: {
    notificationId: "b64130e4-0000-0000-0000-000000000000",
    eventDate: "2026-08-01T12:00:00.000Z",
    data: {
      user: { userId: "y9qonyvfrqq", username: "mcd-toy" },
      order: { orderId: "11-14972-20806" },
    },
  },
};

describe("mapNotificationEvent", () => {
  it("maps an ORDER_CONFIRMATION field by field", () => {
    expect(mapNotificationEvent(ORDER_CONFIRMATION)).toEqual({
      channelNames: ["mcd-toy"],
      channelRefs: ["y9qonyvfrqq"],
      eventType: "order.created",
      externalEventId: "b64130e4-0000-0000-0000-000000000000",
      occurredAt: new Date("2026-08-01T12:00:00.000Z"),
      resourceId: "11-14972-20806",
      topic: "ORDER_CONFIRMATION",
    });
  });

  it("keeps ITEM_MARKED_SHIPPED resourceId null when only an itemId is present", () => {
    // Regression: identifyEbayEvent falls back to itemId for tracing, and
    // resourceId is fed straight to getOrder — a listing id looked up as an
    // order silently resolves to nothing.
    const event = mapNotificationEvent({
      metadata: { topic: "ITEM_MARKED_SHIPPED" },
      notification: {
        notificationId: "n1",
        data: {
          itemMarkedShipped: {
            itemId: "395913613059",
            publicUserId: "abc123",
            username: "seller123",
          },
        },
      },
    });

    expect(event?.resourceId).toBeNull();
    expect(event?.eventType).toBe("order.shipped");
    expect(event?.channelRefs).toEqual(["abc123"]);
  });

  it("reads the order id from ITEM_MARKED_SHIPPED when eBay sends one", () => {
    const event = mapNotificationEvent({
      metadata: { topic: "ITEM_MARKED_SHIPPED" },
      notification: {
        notificationId: "n2",
        data: {
          itemMarkedShipped: {
            itemId: "395913613059",
            orderId: "12-12455-13825",
          },
        },
      },
    });

    expect(event?.resourceId).toBe("12-12455-13825");
  });

  it("maps an unmodelled topic rather than rejecting it", () => {
    const event = mapNotificationEvent({
      metadata: { topic: "RETURN_CREATED" },
      notification: { notificationId: "n3" },
    });

    expect(event?.eventType).toBe("unknown");
    expect(event?.topic).toBe("RETURN_CREATED");
    expect(event?.channelRefs).toEqual([]);
    expect(event?.occurredAt).toBeNull();
  });

  it("returns null for a structurally invalid envelope", () => {
    expect(mapNotificationEvent({})).toBeNull();
    expect(
      mapNotificationEvent({ metadata: { topic: "ORDER_CONFIRMATION" } })
    ).toBeNull();
    expect(
      mapNotificationEvent({ notification: { notificationId: "n4" } })
    ).toBeNull();
  });
});
