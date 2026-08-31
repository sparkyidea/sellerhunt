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
import {
  channelSpreadDelayMs,
  runDispatchChannelSyncs,
  runDispatchOutboxRecovery,
  runDrainSyncOutbox,
} from "../control/dispatchers";
import { registerSchedulers } from "../control/schedulers";

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

async function seedOrg(): Promise<string> {
  const organizationId = `org-${crypto.randomUUID()}`;
  await client.db.insert(organization).values({
    id: organizationId,
    name: "Control Org",
    slug: organizationId,
    createdAt: new Date(),
  });
  await client.db
    .insert(marketplace)
    .values({ id: "ebay", name: "eBay" })
    .onConflictDoNothing();
  return organizationId;
}

async function seedChannel(organizationId: string): Promise<string> {
  const channelId = `ch-${crypto.randomUUID()}`;
  await client.db.insert(channel).values({
    id: channelId,
    organizationId,
    marketplaceId: "ebay",
    reference: `seller-${channelId}`,
    displayName: "Seller",
    connected: true,
  });
  return channelId;
}

describe("schedulers", () => {
  it("registers nothing when the gate is off", async () => {
    const jobs = testJobClient();
    await registerSchedulers({ enabled: false, jobs, logger: ctx.logger });
    const schedulers = await jobs.queue(QUEUES.syncControl).getJobSchedulers();
    expect(schedulers).toHaveLength(0);
  });

  it("is replica-safe: repeated registration upserts stable ids", async () => {
    const jobs = testJobClient();
    await registerSchedulers({ enabled: true, jobs, logger: ctx.logger });
    const first = await jobs.queue(QUEUES.syncControl).getJobSchedulers();
    // A second replica boots and registers the same set.
    await registerSchedulers({ enabled: true, jobs, logger: ctx.logger });
    const second = await jobs.queue(QUEUES.syncControl).getJobSchedulers();

    expect(first.length).toBeGreaterThan(0);
    expect(second.length).toBe(first.length);
    expect(new Set(second.map((s) => s.key)).size).toBe(second.length);
  });
});

describe("dispatch spread", () => {
  it("spreads per-channel jobs deterministically inside the window", async () => {
    const organizationId = await seedOrg();
    const channelIds = [
      await seedChannel(organizationId),
      await seedChannel(organizationId),
      await seedChannel(organizationId),
    ];
    // A disconnected channel must not be dispatched.
    const disconnectedId = await seedChannel(organizationId);
    await client.db
      .update(channel)
      .set({ connected: false })
      .where(eq(channel.id, disconnectedId));

    const jobs = testJobClient();
    const result = await runDispatchChannelSyncs(ctx, jobs);
    // Other suites' channels may exist; ours must all be included.
    expect(result.channels).toBeGreaterThanOrEqual(3);

    const delayed = await jobs.queue(QUEUES.syncOrders).getDelayed();
    const byChannel = new Map(
      delayed.map((job) => [job.data.channelId as string, job])
    );
    for (const channelId of channelIds) {
      const job = byChannel.get(channelId);
      expect(job).toBeDefined();
      const expectedDelay = channelSpreadDelayMs(channelId);
      expect(job?.opts.delay).toBe(expectedDelay);
      expect(expectedDelay).toBeGreaterThanOrEqual(0);
      expect(expectedDelay).toBeLessThan(900_000);
    }
    expect(byChannel.has(disconnectedId)).toBe(false);

    const delayedListings = await jobs.queue(QUEUES.syncListings).getDelayed();
    const listingChannels = new Set(
      delayedListings.map((job) => job.data.channelId as string)
    );
    for (const channelId of channelIds) {
      expect(listingChannels.has(channelId)).toBe(true);
    }
  });
});

describe("seeded dispatcher tick", () => {
  it("drains pending outbox rows and dispatches recoveries with fenced job ids", async () => {
    const organizationId = await seedOrg();
    const channelId = await seedChannel(organizationId);

    const [pendingRow] = await client.db
      .insert(syncOutbox)
      .values({
        organizationId,
        channelId,
        entityType: "order",
        entityId: crypto.randomUUID(),
        action: "createShipment",
        payload: { tracking: "T1", carrier: "USPS", lineItems: [] },
      })
      .returning({ id: syncOutbox.id });
    const [recoverableRow] = await client.db
      .insert(syncOutbox)
      .values({
        organizationId,
        channelId,
        entityType: "order",
        entityId: crypto.randomUUID(),
        action: "createShipment",
        payload: { tracking: "T2", carrier: "USPS", lineItems: [] },
        status: "reconciliation_required",
        claimGeneration: 2,
      })
      .returning({ id: syncOutbox.id });
    if (!(pendingRow && recoverableRow)) {
      throw new Error("seed failed");
    }

    const jobs = testJobClient();
    const drained = await runDrainSyncOutbox(ctx, jobs);
    expect(drained.drained).toBeGreaterThanOrEqual(1);
    const pushJob = await jobs
      .queue(QUEUES.syncShipments)
      .getJob(`outbox-${pendingRow.id}-0`);
    expect(pushJob?.data.outboxId).toBe(pendingRow.id);
    expect(pushJob?.data.generation).toBe(0);

    const recovered = await runDispatchOutboxRecovery(ctx, jobs);
    expect(recovered.dispatched).toBeGreaterThanOrEqual(1);
    const recoveryJob = await jobs
      .queue(QUEUES.syncShipments)
      .getJob(`recover-outbox-${recoverableRow.id}-2`);
    expect(recoveryJob?.data.outboxId).toBe(recoverableRow.id);
    expect(recoveryJob?.data.generation).toBe(2);

    // A failed enqueue self-heals: the recovery row stays unowned, so the
    // next tick re-dispatches it (same fenced id — idempotent).
    const again = await runDispatchOutboxRecovery(ctx, jobs);
    expect(again.dispatched).toBeGreaterThanOrEqual(1);
  });
});
