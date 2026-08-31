import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ShopifyAppClient } from "../client";

const CLIENT_SECRET = "test-shopify-client-secret";
const BODY = JSON.stringify({
  admin_graphql_api_id: "gid://shopify/Order/5223452934372",
  id: 5_223_452_934_372,
});

function headers(signature: string) {
  return {
    "x-shopify-hmac-sha256": signature,
    "x-shopify-shop-domain": "mystore.myshopify.com",
    "x-shopify-topic": "orders/create",
    "x-shopify-triggered-at": "2026-08-10T12:00:00.000Z",
    "x-shopify-webhook-id": "b54557e4-0000-0000-0000-000000000000",
  };
}

const client = new ShopifyAppClient({
  clientId: "unused",
  clientSecret: CLIENT_SECRET,
});

describe("ShopifyAppClient.verifyNotification", () => {
  it("normalizes a delivery whose HMAC checks out", async () => {
    const signature = createHmac("sha256", CLIENT_SECRET)
      .update(BODY, "utf8")
      .digest("base64");

    await expect(
      client.verifyNotification({ headers: headers(signature), rawBody: BODY })
    ).resolves.toEqual({
      channelNames: [],
      channelRefs: ["https://mystore.myshopify.com"],
      eventType: "order.created",
      externalEventId: "b54557e4-0000-0000-0000-000000000000",
      occurredAt: new Date("2026-08-10T12:00:00.000Z"),
      resourceId: "5223452934372",
      topic: "orders/create",
    });
  });

  it("returns null for a forged HMAC", async () => {
    const signature = createHmac("sha256", "wrong-secret")
      .update(BODY, "utf8")
      .digest("base64");

    await expect(
      client.verifyNotification({ headers: headers(signature), rawBody: BODY })
    ).resolves.toBeNull();
  });

  it("returns null when the signature header is missing", async () => {
    await expect(
      client.verifyNotification({
        headers: { "x-shopify-topic": "orders/create" },
        rawBody: BODY,
      })
    ).resolves.toBeNull();
  });

  it("reports the topics it expects a per-shop subscription for", () => {
    expect(client.getSellerTopics()).toEqual([
      "orders/create",
      "orders/updated",
      "orders/fulfilled",
      "orders/cancelled",
      "products/create",
      "products/update",
      "products/delete",
      "app/uninstalled",
    ]);
  });
});
