import { createDbClient } from "@dashseller/db/client";
import type { JobClient } from "@dashseller/job-client";
import { createJobClient } from "@dashseller/job-client";
import type {
  AppConfig,
  NotificationEvent,
} from "@dashseller/marketplace/types";
import { Hono } from "hono";
import { afterAll, describe, expect, it } from "vitest";
import { createWebhookPolicies, type WebhookMarketplace } from "../policy";
import { createWebhookRoutes } from "../routes";

// Every test injects its own resolver, so this connection is never used —
// postgres.js connects lazily, making the typed handle free to hold.
const dbClient = createDbClient("postgres://unused:unused@127.0.0.1:1/unused");
afterAll(() => dbClient.close());

const getAppCredentials = (marketplaceId: WebhookMarketplace): AppConfig =>
  marketplaceId === "ebay"
    ? {
        clientId: "test-ebay-client-id",
        clientSecret: "test-ebay-client-secret",
      }
    : {
        clientId: "test-shopify-client-id",
        clientSecret: "test-shopify-client-secret",
      };

const policies = createWebhookPolicies({
  ebayVerificationToken: "test-verification-token-0123456789abcdef",
  getAppCredentials,
});

interface EnqueueCall {
  args: unknown[];
  method: string;
}

function fakeJobs(overrides: Partial<JobClient> = {}): {
  calls: EnqueueCall[];
  jobs: JobClient;
} {
  const calls: EnqueueCall[] = [];
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
      return Promise.resolve();
    };
  const jobs = {
    close: () => Promise.resolve(),
    queue: () => {
      throw new Error("not used");
    },
    enqueueArchiveListing: record("enqueueArchiveListing"),
    enqueueDisconnectChannel: record("enqueueDisconnectChannel"),
    enqueueRecoverOutbox: record("enqueueRecoverOutbox"),
    enqueueRefreshChannelTokens: record("enqueueRefreshChannelTokens"),
    enqueueRepairChannelSubscriptions: record(
      "enqueueRepairChannelSubscriptions"
    ),
    enqueueSyncChannelInfo: record("enqueueSyncChannelInfo"),
    enqueueSyncChannelListings: record("enqueueSyncChannelListings"),
    enqueueSyncChannelOrders: record("enqueueSyncChannelOrders"),
    enqueueSyncOrder: record("enqueueSyncOrder"),
    enqueueSyncShipment: record("enqueueSyncShipment"),
    ...overrides,
  } as JobClient;
  return { calls, jobs };
}

function event(overrides: Partial<NotificationEvent> = {}): NotificationEvent {
  return {
    channelNames: [],
    channelRefs: ["seller-1"],
    eventType: "order.created",
    externalEventId: "delivery-1",
    occurredAt: new Date("2026-08-10T12:00:00Z"),
    resourceId: "order-123",
    topic: "orders/create",
    ...overrides,
  };
}

const CONNECTED_CHANNEL = {
  id: "ch-1",
  archived: false,
  connected: true,
  connectionGeneration: "gen-aaaa",
  enabled: true,
};

function buildApp(params: {
  jobs: JobClient;
  persisted?: unknown[];
  resolved?: typeof CONNECTED_CHANNEL | null;
  verified?: NotificationEvent | null | Error;
}): Hono {
  const app = new Hono();
  app.route(
    "/webhook",
    createWebhookRoutes({
      db: dbClient.db,
      getAppCredentials,
      jobs: params.jobs,
      // The shared db handle is dead by design — capture instead of insert.
      persistDelivery: (record) => params.persisted?.push(record),
      policies,
      // Same base the pinned challenge hash was computed over.
      webhookBaseUrl: "https://api.test.dashseller.com",
      verifyNotification: () => {
        if (params.verified instanceof Error) {
          return Promise.reject(params.verified);
        }
        // `undefined` = default fixture; an explicit null IS the mismatch case.
        return Promise.resolve(
          params.verified === undefined ? event() : params.verified
        );
      },
      resolveChannel: () =>
        Promise.resolve(
          params.resolved === undefined ? CONNECTED_CHANNEL : params.resolved
        ),
    })
  );
  return app;
}

function post(app: Hono, marketplace: string, body = "{}") {
  return app.request(`/webhook/${marketplace}`, {
    method: "POST",
    body,
    headers: { "content-type": "application/json" },
  });
}

describe("GET /webhook/:marketplace (challenge)", () => {
  it("answers eBay's challenge with the pinned hash of code + token + endpoint", async () => {
    const { jobs } = fakeJobs();
    const app = buildApp({ jobs });
    const res = await app.request(
      "/webhook/ebay?challenge_code=challenge-code-fixture"
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      challengeResponse:
        "293766c4c48ba7a7651a1230e308648a4ec8a8e9ad73fb40ca2058f3d17e5827",
    });
  });

  it("404s for a marketplace with no challenge handshake", async () => {
    const { jobs } = fakeJobs();
    const app = buildApp({ jobs });
    const res = await app.request("/webhook/shopify?challenge_code=abc");
    expect(res.status).toBe(404);
  });

  it("does not treat inherited Object.prototype keys as marketplaces", async () => {
    const { jobs } = fakeJobs();
    const app = buildApp({ jobs });
    const res = await app.request("/webhook/toString?challenge_code=abc");
    expect(res.status).toBe(404);
  });
});

describe("verification outcomes", () => {
  it("rejects a signature mismatch per policy (eBay 412, Shopify 401)", async () => {
    const { jobs, calls } = fakeJobs();
    const app = buildApp({ jobs, verified: null });
    expect((await post(app, "ebay")).status).toBe(412);
    expect((await post(app, "shopify")).status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("answers verification unavailability per policy (eBay 500, Shopify 200)", async () => {
    const { jobs, calls } = fakeJobs();
    const app = buildApp({ jobs, verified: new Error("key fetch failed") });
    expect((await post(app, "ebay")).status).toBe(500);
    expect((await post(app, "shopify")).status).toBe(200);
    expect(calls).toHaveLength(0);
  });

  it("caps the payload size at 1 MB", async () => {
    const { jobs, calls } = fakeJobs();
    const app = buildApp({ jobs });
    const res = await app.request("/webhook/ebay", {
      method: "POST",
      body: "x",
      headers: { "content-length": String(2 * 1024 * 1024) },
    });
    expect(res.status).toBe(413);
    expect(calls).toHaveLength(0);
  });
});

describe("no-job branches", () => {
  it("ACKs unhandled event types without enqueueing", async () => {
    const { jobs, calls } = fakeJobs();
    const app = buildApp({
      jobs,
      verified: event({ eventType: "message.received" }),
    });
    expect((await post(app, "ebay")).status).toBe(204);
    expect(calls).toHaveLength(0);
  });

  it("ACKs unattributed events without enqueueing", async () => {
    const { jobs, calls } = fakeJobs();
    const app = buildApp({ jobs, resolved: null });
    expect((await post(app, "ebay")).status).toBe(204);
    expect(calls).toHaveLength(0);
  });

  it("gates non-disconnect events for disconnected channels", async () => {
    const { jobs, calls } = fakeJobs();
    const app = buildApp({
      jobs,
      resolved: { ...CONNECTED_CHANNEL, connected: false },
    });
    expect((await post(app, "ebay")).status).toBe(204);
    expect(calls).toHaveLength(0);
  });

  it("gates non-disconnect events for disabled channels", async () => {
    const { jobs, calls } = fakeJobs();
    const app = buildApp({
      jobs,
      resolved: { ...CONNECTED_CHANNEL, enabled: false },
    });
    expect((await post(app, "ebay")).status).toBe(204);
    expect(calls).toHaveLength(0);
  });

  it("gates non-disconnect events for archived channels", async () => {
    const { jobs, calls } = fakeJobs();
    const app = buildApp({
      jobs,
      resolved: { ...CONNECTED_CHANNEL, archived: true },
    });
    expect((await post(app, "ebay")).status).toBe(204);
    expect(calls).toHaveLength(0);
  });
});

describe("domain job routing", () => {
  it("enqueues sync-order with the delivery identity and envelope", async () => {
    const { jobs, calls } = fakeJobs();
    const app = buildApp({ jobs });
    expect((await post(app, "ebay")).status).toBe(204);
    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call?.method).toBe("enqueueSyncOrder");
    expect(call?.args[0]).toMatchObject({
      channelId: "ch-1",
      orderReference: "order-123",
      envelope: {
        schemaVersion: 1,
        provider: "ebay",
        externalDeliveryId: "delivery-1",
        connectionGeneration: "gen-aaaa",
        providerEventAt: "2026-08-10T12:00:00.000Z",
      },
    });
    expect(call?.args[1]).toEqual({
      marketplace: "ebay",
      deliveryId: "delivery-1",
    });
  });

  it("records verified deliveries with their outcome, never rejected ones", async () => {
    const { jobs } = fakeJobs();
    const persisted: unknown[] = [];
    const app = buildApp({ jobs, persisted });
    await post(app, "ebay", JSON.stringify({ sample: true }));
    expect(persisted).toEqual([
      {
        marketplace: "ebay",
        outcome: "enqueued",
        channelId: "ch-1",
        event: event(),
        payload: { sample: true },
      },
    ]);

    // The endpoint is public — a forged (unverified) POST must not be able
    // to write log rows.
    const rejected: unknown[] = [];
    const rejecting = buildApp({ jobs, persisted: rejected, verified: null });
    await post(rejecting, "ebay");
    expect(rejected).toEqual([]);
  });

  it("falls back to a windowed pull when an order event has no resource id", async () => {
    const { jobs, calls } = fakeJobs();
    const app = buildApp({ jobs, verified: event({ resourceId: null }) });
    expect((await post(app, "ebay")).status).toBe(204);
    expect(calls[0]?.method).toBe("enqueueSyncChannelOrders");
  });

  it("routes products/delete to archive-listing with the provider clock", async () => {
    const { jobs, calls } = fakeJobs();
    const app = buildApp({
      jobs,
      verified: event({
        eventType: "listing.deleted",
        topic: "products/delete",
        resourceId: "prod-9",
        occurredAt: new Date("2026-08-11T08:30:00Z"),
      }),
    });
    expect((await post(app, "shopify")).status).toBe(200);
    const call = calls[0];
    expect(call?.method).toBe("enqueueArchiveListing");
    expect(call?.args[0]).toMatchObject({
      channelId: "ch-1",
      listingReference: "prod-9",
      tombstoneVersionAt: "2026-08-11T08:30:00.000Z",
    });
  });

  it("falls back to a listings pull when a delete has no provider clock", async () => {
    const { jobs, calls } = fakeJobs();
    const app = buildApp({
      jobs,
      verified: event({
        eventType: "listing.deleted",
        resourceId: "prod-9",
        occurredAt: null,
      }),
    });
    expect((await post(app, "shopify")).status).toBe(200);
    expect(calls[0]?.method).toBe("enqueueSyncChannelListings");
  });

  it("disconnects bypass the connected gate and carry the captured generation", async () => {
    const { jobs, calls } = fakeJobs();
    const app = buildApp({
      jobs,
      resolved: {
        ...CONNECTED_CHANNEL,
        connected: false,
        connectionGeneration: "gen-old",
      },
      verified: event({
        eventType: "authorization.revoked",
        topic: "app/uninstalled",
        resourceId: null,
      }),
    });
    expect((await post(app, "shopify")).status).toBe(200);
    const call = calls[0];
    expect(call?.method).toBe("enqueueDisconnectChannel");
    expect(call?.args[0]).toMatchObject({
      channelId: "ch-1",
      connectionGeneration: "gen-old",
    });
    expect(call?.args[1]).toEqual({
      marketplace: "shopify",
      deliveryId: "delivery-1",
    });
  });
});

describe("enqueue failures", () => {
  it("answers per policy when the enqueue throws (eBay 500, Shopify 200)", async () => {
    const failing = fakeJobs({
      enqueueSyncOrder: () => Promise.reject(new Error("redis down")),
    });
    const app = buildApp({ jobs: failing.jobs });
    expect((await post(app, "ebay")).status).toBe(500);
    expect((await post(app, "shopify")).status).toBe(200);
  });

  it("answers bounded and honest when Redis is unreachable", async () => {
    // Real producer pointed at a closed port. Two regimes:
    // - connected-then-dropped: enableOfflineQueue: false rejects the
    //   command immediately (no in-process buffering, ever);
    // - never-connected (this test): BullMQ waits for readiness, so the
    //   POLICY BUDGET is the bound — 10s for eBay, 2.5s for Shopify (under
    //   its 5s hang-up). Either way the marketplace gets the policy status
    //   and nothing pretends the enqueue happened.
    const jobs = createJobClient("redis://127.0.0.1:1");
    try {
      const app = buildApp({ jobs });
      const started = Date.now();
      const res = await post(app, "ebay");
      expect(res.status).toBe(500);
      expect(Date.now() - started).toBeLessThan(11_000);
    } finally {
      await jobs.close().catch(() => undefined);
    }
  });
});
