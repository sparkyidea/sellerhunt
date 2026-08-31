import { describe, expect, it } from "vitest";
import { convertNotificationEventType } from "../enums";
import {
  fromShopifyGraphqlTopic,
  getSubscribableShopifyTopics,
  SHOPIFY_TOPICS,
  toShopifyGraphqlTopic,
} from "../topics";

describe("shopify topics", () => {
  it("round-trips every entry between header and GraphQL spellings", () => {
    for (const spec of SHOPIFY_TOPICS) {
      expect(toShopifyGraphqlTopic(spec.topic)).toBe(spec.graphqlTopic);
      expect(fromShopifyGraphqlTopic(spec.graphqlTopic)).toBe(spec.topic);
    }
  });

  it("has no spelling for topics outside the catalogue", () => {
    expect(toShopifyGraphqlTopic("carts/update")).toBeUndefined();
    expect(fromShopifyGraphqlTopic("CARTS_UPDATE")).toBeUndefined();
  });

  it("excludes app-scoped topics from the per-shop subscription set", () => {
    const subscribable = getSubscribableShopifyTopics();
    expect(subscribable.every((spec) => spec.scope === "seller")).toBe(true);
    expect(subscribable).toHaveLength(
      SHOPIFY_TOPICS.filter((spec) => spec.scope === "seller").length
    );
  });

  it("gives every handled topic a modelled event type", () => {
    // The worker's handler map is keyed by event type — a handled topic that
    // normalized to `unknown` would be archived and never dispatched.
    for (const spec of SHOPIFY_TOPICS.filter((s) => s.handled)) {
      expect(convertNotificationEventType(spec.topic)).not.toBe("unknown");
    }
  });
});
