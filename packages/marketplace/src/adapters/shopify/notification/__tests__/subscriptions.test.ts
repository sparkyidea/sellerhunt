import { describe, expect, it, vi } from "vitest";
import {
  SHOPIFY_API_VERSION,
  type ShopifyAdminClient,
} from "../../create-shopify-client";
import { reconcileShopifySubscriptions } from "../subscriptions";
import { getSubscribableShopifyTopics } from "../topics";

const ENDPOINT = "https://api.example.com/webhook/shopify";
const TOPIC_COUNT = getSubscribableShopifyTopics().length;

interface RecordedCall {
  operation: string;
  variables: Record<string, unknown>;
}

interface StubResponse {
  data?: Record<string, unknown>;
  errors?: {
    graphQLErrors?: Array<{ extensions?: { code?: string }; message?: string }>;
    message?: string;
  };
}

interface ExistingSubscription {
  apiVersion?: string;
  callbackUrl?: string;
  id: string;
  topic: string;
}

/**
 * Only `request` is exercised; the rest of the client exists to satisfy the
 * type. `vi.fn()` stays untyped because `ApiClientRequest`'s return is a
 * deferred conditional no concrete implementation can be written against.
 */
function createStubClient(respond: (call: RecordedCall) => StubResponse) {
  const calls: RecordedCall[] = [];
  const request = vi.fn();
  request.mockImplementation(
    (operation: string, options: { variables: Record<string, unknown> }) => {
      const call = { operation, variables: options.variables };
      calls.push(call);
      return Promise.resolve(respond(call));
    }
  );

  const client: ShopifyAdminClient = {
    config: {
      accessToken: "shpat_test",
      apiUrl: `https://test.myshopify.com/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
      apiVersion: SHOPIFY_API_VERSION,
      headers: {},
      storeDomain: "https://test.myshopify.com",
    },
    fetch: vi.fn(),
    getApiUrl: vi.fn(),
    getHeaders: vi.fn(),
    request,
  };

  return { calls, client };
}

function subscriptionsPage(nodes: ExistingSubscription[]): StubResponse {
  return {
    data: {
      webhookSubscriptions: {
        edges: nodes.map((node) => ({
          node: {
            apiVersion: { handle: node.apiVersion ?? SHOPIFY_API_VERSION },
            endpoint: node.callbackUrl ? { callbackUrl: node.callbackUrl } : {},
            id: node.id,
            topic: node.topic,
          },
        })),
        pageInfo: { endCursor: null, hasNextPage: false },
      },
    },
  };
}

function mutationOk(resultKey: string, id: string): StubResponse {
  return {
    data: { [resultKey]: { userErrors: [], webhookSubscription: { id } } },
  };
}

function callsFor(calls: RecordedCall[], name: string): RecordedCall[] {
  return calls.filter((call) => call.operation.includes(name));
}

function allExisting(callbackUrl: string, apiVersion?: string) {
  return getSubscribableShopifyTopics().map((spec, index) => ({
    apiVersion,
    callbackUrl,
    id: `gid://shopify/WebhookSubscription/${index + 1}`,
    topic: spec.graphqlTopic,
  }));
}

describe("reconcileShopifySubscriptions", () => {
  it("creates every topic with `uri` as the only input field", async () => {
    const { calls, client } = createStubClient((call) =>
      call.operation.includes("webhookSubscriptionCreate")
        ? mutationOk("webhookSubscriptionCreate", "gid://new/1")
        : subscriptionsPage([])
    );

    const results = await reconcileShopifySubscriptions(client, ENDPOINT);

    const creates = callsFor(calls, "webhookSubscriptionCreate");
    expect(creates).toHaveLength(TOPIC_COUNT);
    // `toEqual` is exact: an extra `apiVersion` key here is the coercion error
    // that made Shopify answer 200 with `data: null` for every mutation.
    expect(creates[0]?.variables).toEqual({
      topic: "ORDERS_CREATE",
      webhookSubscription: { uri: ENDPOINT },
    });
    for (const create of creates) {
      expect(create.variables.webhookSubscription).toEqual({ uri: ENDPOINT });
    }
    expect(results.every((result) => result.status === "enabled")).toBe(true);
  });

  it("sends no mutation when the callback URL already matches", async () => {
    const existing = allExisting(ENDPOINT);
    const { calls, client } = createStubClient(() =>
      subscriptionsPage(existing)
    );

    const results = await reconcileShopifySubscriptions(client, ENDPOINT);

    expect(calls).toHaveLength(1);
    expect(results.map((result) => result.subscriptionId)).toEqual(
      existing.map((node) => node.id)
    );
    expect(results.every((result) => result.status === "enabled")).toBe(true);
  });

  it("re-points an existing subscription in place when the URL differs", async () => {
    const { calls, client } = createStubClient((call) => {
      if (call.operation.includes("webhookSubscriptionUpdate")) {
        return mutationOk("webhookSubscriptionUpdate", "gid://existing/1");
      }
      if (call.operation.includes("webhookSubscriptionCreate")) {
        return mutationOk("webhookSubscriptionCreate", "gid://new/1");
      }
      return subscriptionsPage([
        {
          callbackUrl: "https://old.example.com/webhook/shopify",
          id: "gid://existing/1",
          topic: "ORDERS_CREATE",
        },
      ]);
    });

    const results = await reconcileShopifySubscriptions(client, ENDPOINT);

    const updates = callsFor(calls, "webhookSubscriptionUpdate");
    expect(updates).toHaveLength(1);
    expect(updates[0]?.variables).toEqual({
      id: "gid://existing/1",
      webhookSubscription: { uri: ENDPOINT },
    });
    // Re-pointed, not deleted and recreated: a delete drops queued retries.
    expect(callsFor(calls, "webhookSubscriptionDelete")).toHaveLength(0);
    expect(callsFor(calls, "webhookSubscriptionCreate")).toHaveLength(
      TOPIC_COUNT - 1
    );
    expect(results.find((result) => result.topic === "orders/create")).toEqual({
      status: "enabled",
      subscriptionId: "gid://existing/1",
      topic: "orders/create",
    });
  });

  it("warns about a stale payload version instead of firing a no-op mutation", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { calls, client } = createStubClient(() =>
      subscriptionsPage(allExisting(ENDPOINT, "2024-01"))
    );

    const results = await reconcileShopifySubscriptions(client, ENDPOINT);

    // `apiVersion` is unsettable, so a mutation could not repair the drift —
    // it would only fail forever, once per topic, on every repair tick.
    expect(calls).toHaveLength(1);
    expect(results.every((result) => result.status === "enabled")).toBe(true);
    expect(warn).toHaveBeenCalledTimes(TOPIC_COUNT);
    expect(warn.mock.calls[0]?.[0]).toContain("2024-01");
    warn.mockRestore();
  });

  it("reports a userErrors response as an error", async () => {
    const { client } = createStubClient((call) =>
      call.operation.includes("webhookSubscriptionCreate")
        ? {
            data: {
              webhookSubscriptionCreate: {
                userErrors: [
                  {
                    field: ["webhookSubscription", "uri"],
                    message: "is not a valid URL",
                  },
                ],
                webhookSubscription: null,
              },
            },
          }
        : subscriptionsPage([])
    );

    const results = await reconcileShopifySubscriptions(client, ENDPOINT);

    expect(results.every((result) => result.status === "error")).toBe(true);
    expect(results[0]?.error).toBe(
      "webhookSubscription.uri: is not a valid URL"
    );
  });

  it("reports an ACCESS_DENIED GraphQL error as unavailable", async () => {
    const { client } = createStubClient((call) =>
      call.operation.includes("webhookSubscriptionCreate")
        ? {
            errors: {
              graphQLErrors: [
                {
                  extensions: { code: "ACCESS_DENIED" },
                  message: "Required access `read_orders` scope is missing",
                },
              ],
            },
          }
        : subscriptionsPage([])
    );

    const results = await reconcileShopifySubscriptions(client, ENDPOINT);

    // A missing scope is a property of the install, not a failure to retry.
    expect(results.every((result) => result.status === "unavailable")).toBe(
      true
    );
    expect(results[0]?.error).toContain("ACCESS_DENIED");
  });
});
