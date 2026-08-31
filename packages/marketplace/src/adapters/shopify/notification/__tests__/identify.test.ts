import { describe, expect, it } from "vitest";
import { stripGid } from "../../api/helper/strip-gid";
import { identifyShopifyEvent } from "../identify";

const SHOP_DOMAIN = "mystore.myshopify.com";

/** REST-shaped: `id` is a number, and the gid is carried separately. */
const ORDER_PAYLOAD = {
  admin_graphql_api_id: "gid://shopify/Order/5223452934372",
  id: 5_223_452_934_372,
};

describe("identifyShopifyEvent", () => {
  it("resolves an order id both encodings agree on", () => {
    const identity = identifyShopifyEvent(
      "orders/create",
      SHOP_DOMAIN,
      ORDER_PAYLOAD
    );

    expect(identity.resourceId).toBe(
      stripGid(ORDER_PAYLOAD.admin_graphql_api_id)
    );
    expect(identity.resourceId).toBe(String(ORDER_PAYLOAD.id));
    expect(identity.channelRefs).toEqual(["https://mystore.myshopify.com"]);
    expect(identity.channelNames).toEqual([]);
  });

  it("falls back to the numeric id when the gid is absent", () => {
    const identity = identifyShopifyEvent("orders/fulfilled", SHOP_DOMAIN, {
      id: 5_223_452_934_372,
    });

    expect(identity.resourceId).toBe("5223452934372");
  });

  it("identifies an uninstall by shop domain", () => {
    const identity = identifyShopifyEvent("app/uninstalled", SHOP_DOMAIN, {
      id: 55_555,
      myshopify_domain: SHOP_DOMAIN,
    });

    expect(identity.channelRefs).toEqual(["https://mystore.myshopify.com"]);
    expect(identity.resourceId).toBe(SHOP_DOMAIN);
  });

  it("yields empty candidates without a shop domain, and doesn't throw", () => {
    const identity = identifyShopifyEvent("orders/create", null, ORDER_PAYLOAD);

    expect(identity.channelRefs).toEqual([]);
    expect(identity.channelNames).toEqual([]);
    expect(identity.resourceId).toBe("5223452934372");
  });

  it("refuses to guess a resource id for an unmodelled topic", () => {
    // resourceId is fed straight to getOrder — an id of the wrong entity is
    // worse than none.
    const identity = identifyShopifyEvent("carts/update", SHOP_DOMAIN, {
      id: 99_999,
    });

    expect(identity.resourceId).toBeNull();
    expect(identity.channelRefs).toEqual(["https://mystore.myshopify.com"]);
  });
});
