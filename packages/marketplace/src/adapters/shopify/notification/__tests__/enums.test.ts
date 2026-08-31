import { describe, expect, it } from "vitest";
import { convertNotificationEventType } from "../enums";

describe("convertNotificationEventType", () => {
  it("maps the subscribed topics", () => {
    expect(convertNotificationEventType("orders/create")).toBe("order.created");
    expect(convertNotificationEventType("orders/fulfilled")).toBe(
      "order.shipped"
    );
    expect(convertNotificationEventType("orders/cancelled")).toBe(
      "order.canceled"
    );
    expect(convertNotificationEventType("app/uninstalled")).toBe(
      "authorization.revoked"
    );
  });

  it("maps an unmodelled topic to unknown rather than throwing", () => {
    expect(convertNotificationEventType("carts/update")).toBe("unknown");
  });
});
