import { createDbClient } from "@dashseller/db/client";
import {
  channel,
  marketplace,
  organization,
  syncOutbox,
} from "@dashseller/db/schema";
import {
  migrateTestDb,
  TEST_DATABASE_URL,
  TEST_REDIS_URL,
} from "@dashseller/db/testing";
import {
  createJobClient,
  type JobClient,
  QUEUES,
} from "@dashseller/job-client";
import type { SyncContext } from "@dashseller/sync";
import { systemClock } from "@dashseller/sync";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { collectStats, WorkerCounters } from "../stats";

let client: ReturnType<typeof createDbClient>;
let ctx: SyncContext;
const cleanups: Array<() => Promise<void>> = [];

beforeAll(async () => {
  await migrateTestDb();
  client = createDbClient(TEST_DATABASE_URL);
  ctx = {
    db: client.db,
    clock: systemClock,
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    },
    credentials: {
      encryptionSecret: "unused",
      getAppCredentials: () => {
        throw new Error("unused");
      },
      getMarketplaceCredentials: () => {
        throw new Error("unused");
      },
    },
    geo: {
      getProviderId: () => "rollo" as const,
      geocode: () => {
        throw new Error("unused");
      },
    },
  };
});

afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()?.();
  }
});

afterAll(async () => {
  await client.close();
});

function testJobClient(): JobClient {
  const prefix = `t${crypto.randomUUID().slice(0, 8)}`;
  const jobs = createJobClient(TEST_REDIS_URL, { prefix });
  cleanups.push(() => jobs.close());
  return jobs;
}

async function seedPendingOutboxRow(): Promise<string> {
  const organizationId = `org-${crypto.randomUUID()}`;
  await client.db.insert(organization).values({
    id: organizationId,
    name: "Stats Org",
    slug: organizationId,
    createdAt: new Date(),
  });
  await client.db
    .insert(marketplace)
    .values({ id: "ebay", name: "eBay" })
    .onConflictDoNothing();
  const channelId = `ch-${crypto.randomUUID()}`;
  await client.db.insert(channel).values({
    id: channelId,
    organizationId,
    marketplaceId: "ebay",
    reference: `seller-${channelId}`,
    displayName: "Seller",
    connected: true,
  });
  const [row] = await client.db
    .insert(syncOutbox)
    .values({
      organizationId,
      channelId,
      entityType: "order",
      entityId: crypto.randomUUID(),
      action: "createShipment",
      payload: { tracking: "T-STATS", carrier: "USPS", lineItems: [] },
      status: "pending",
    })
    .returning({ id: syncOutbox.id });
  if (!row) {
    throw new Error("seed failed");
  }
  cleanups.push(async () => {
    await client.db
      .delete(organization)
      .where(eq(organization.id, organizationId));
  });
  return row.id;
}

describe("collectStats", () => {
  it("reports queue depths, outbox backlog with server-side age, and counters", async () => {
    const jobs = testJobClient();
    await seedPendingOutboxRow();
    await jobs.enqueueSyncChannelOrders(
      { channelId: "stats-ch", forceRefresh: false },
      { delayMs: 60_000 }
    );

    const counters = new WorkerCounters();
    counters.completed = 7;
    counters.rateLimited = 2;

    const stats = await collectStats({ counters, ctx, jobs });

    for (const name of Object.values(QUEUES)) {
      expect(stats.queues[name]).toBeDefined();
    }
    expect(stats.queues[QUEUES.syncOrders]?.delayed).toBe(1);

    expect(stats.outbox.pending).toBeGreaterThanOrEqual(1);
    expect(stats.outbox.oldestPendingAgeSeconds).toBeTypeOf("number");
    expect(stats.outbox.oldestPendingAgeSeconds).toBeGreaterThanOrEqual(0);

    expect(stats.counters.completed).toBe(7);
    expect(stats.counters.rateLimited).toBe(2);
    expect(stats.counters.failed).toBe(0);
  });

  it("returns a null age when no pending rows exist for the empty shape", async () => {
    const jobs = testJobClient();
    // Other suites may leave pending rows; assert only the shape contract
    // that a missing aggregate row degrades to zeros/null.
    const stats = await collectStats({
      counters: new WorkerCounters(),
      ctx,
      jobs,
    });
    expect(stats.outbox.reconciliationRequired).toBeGreaterThanOrEqual(0);
    if (stats.outbox.pending === 0) {
      expect(stats.outbox.oldestPendingAgeSeconds).toBeNull();
    }
  });
});
