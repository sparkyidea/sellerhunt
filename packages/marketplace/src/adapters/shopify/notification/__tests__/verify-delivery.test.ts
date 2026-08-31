import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyShopifyWebhookHmac } from "../verify-delivery";

const CLIENT_SECRET = "test-shopify-client-secret";
const BODY = '{"id":5223452934372,"admin_graphql_api_id":"gid://x"}';

function sign(rawBody: string, secret = CLIENT_SECRET): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
}

describe("verifyShopifyWebhookHmac", () => {
  it("accepts a signature computed the way Shopify computes it", () => {
    expect(
      verifyShopifyWebhookHmac({
        clientSecret: CLIENT_SECRET,
        rawBody: BODY,
        signature: sign(BODY),
      })
    ).toBe(true);
  });

  it("rejects a tampered body", () => {
    expect(
      verifyShopifyWebhookHmac({
        clientSecret: CLIENT_SECRET,
        rawBody: `${BODY} `,
        signature: sign(BODY),
      })
    ).toBe(false);
  });

  it("rejects a signature from a different secret", () => {
    expect(
      verifyShopifyWebhookHmac({
        clientSecret: CLIENT_SECRET,
        rawBody: BODY,
        signature: sign(BODY, "test-other-app-secret"),
      })
    ).toBe(false);
  });

  it("returns false for malformed base64 instead of throwing", () => {
    expect(() =>
      verifyShopifyWebhookHmac({
        clientSecret: CLIENT_SECRET,
        rawBody: BODY,
        signature: "!!! not base64 !!!",
      })
    ).not.toThrow();
    expect(
      verifyShopifyWebhookHmac({
        clientSecret: CLIENT_SECRET,
        rawBody: BODY,
        signature: "!!! not base64 !!!",
      })
    ).toBe(false);
  });

  it("returns false for a wrong-length signature", () => {
    // timingSafeEqual throws on mismatched lengths — the guard is what turns a
    // truncated header into a rejection instead of a 500 on the receiver.
    const truncated = sign(BODY).slice(0, 20);
    expect(() =>
      verifyShopifyWebhookHmac({
        clientSecret: CLIENT_SECRET,
        rawBody: BODY,
        signature: truncated,
      })
    ).not.toThrow();
    expect(
      verifyShopifyWebhookHmac({
        clientSecret: CLIENT_SECRET,
        rawBody: BODY,
        signature: truncated,
      })
    ).toBe(false);
  });

  it("round-trips a multi-byte UTF-8 body", () => {
    const body = '{"note":"🚚 送货 — café"}';
    expect(
      verifyShopifyWebhookHmac({
        clientSecret: CLIENT_SECRET,
        rawBody: body,
        signature: sign(body),
      })
    ).toBe(true);
  });
});
