import { describe, expect, it } from "vitest";
import { mapNotificationEvent } from "../mapper/map-notification-event";

const BODY = JSON.stringify({
  admin_graphql_api_id: "gid://shopify/Order/5223452934372",
  id: 5_223_452_934_372,
});

/** Header names arrive lower-cased — the receiver normalizes before adapters see them. */
function headers(overrides: Record<string, string | undefined> = {}) {
  return {
    "x-shopify-api-version": "2026-07",
    "x-shopify-event-id": "event-1",
    "x-shopify-shop-domain": "mystore.myshopify.com",
    "x-shopify-topic": "orders/create",
    "x-shopify-triggered-at": "2026-08-10T12:00:00.000Z",
    "x-shopify-webhook-id": "b54557e4-0000-0000-0000-000000000000",
    ...overrides,
  };
}

describe("mapNotificationEvent", () => {
  it("maps a full delivery field by field", () => {
    expect(mapNotificationEvent({ headers: headers(), rawBody: BODY })).toEqual(
      {
        channelNames: [],
        channelRefs: ["https://mystore.myshopify.com"],
        eventType: "order.created",
        externalEventId: "b54557e4-0000-0000-0000-000000000000",
        occurredAt: new Date("2026-08-10T12:00:00.000Z"),
        resourceId: "5223452934372",
        topic: "orders/create",
      }
    );
  });

  it("canonicalizes the shop domain to channel.reference form", () => {
    const event = mapNotificationEvent({
      headers: headers({ "x-shopify-shop-domain": "MyStore.myshopify.com" }),
      rawBody: BODY,
    });

    expect(event.channelRefs[0]).toBe("https://mystore.myshopify.com");
  });

  it("prefers the webhook id, then the event id", () => {
    const event = mapNotificationEvent({
      headers: headers({ "x-shopify-webhook-id": undefined }),
      rawBody: BODY,
    });

    expect(event.externalEventId).toBe("event-1");
  });

  it("falls back to a deterministic body hash when both ids are missing", () => {
    const input = {
      headers: headers({
        "x-shopify-event-id": undefined,
        "x-shopify-webhook-id": undefined,
      }),
      rawBody: BODY,
    };

    const first = mapNotificationEvent(input);
    const second = mapNotificationEvent(input);

    expect(first.externalEventId).toHaveLength(64);
    expect(second.externalEventId).toBe(first.externalEventId);
  });

  it("nulls an unparseable triggered-at rather than emitting an Invalid Date", () => {
    const event = mapNotificationEvent({
      headers: headers({ "x-shopify-triggered-at": "not a date" }),
      rawBody: BODY,
    });

    expect(event.occurredAt).toBeNull();
  });

  it("keeps an unreadable body as an event instead of rejecting it", () => {
    // Rejecting authentic deliveries is how Shopify's 8-failure rule deletes
    // the subscription out from under us.
    const event = mapNotificationEvent({
      headers: headers(),
      rawBody: "<html>gateway error</html>",
    });

    expect(event.eventType).toBe("unknown");
    expect(event.topic).toBe("orders/create");
    expect(event.externalEventId).toBe("b54557e4-0000-0000-0000-000000000000");
    expect(event.channelRefs).toEqual(["https://mystore.myshopify.com"]);
    expect(event.resourceId).toBeNull();
  });

  it("maps an unsubscribed topic as unknown", () => {
    const event = mapNotificationEvent({
      headers: headers({ "x-shopify-topic": "carts/update" }),
      rawBody: BODY,
    });

    expect(event.eventType).toBe("unknown");
    expect(event.topic).toBe("carts/update");
    expect(event.resourceId).toBeNull();
  });
});
