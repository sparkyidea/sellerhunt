import { createDbClient } from "@dashseller/db/client";
import {
  channel,
  channelWebhookSubscription,
  marketplace,
  organization,
  syncOutbox,
} from "@dashseller/db/schema";
import { migrateTestDb, TEST_DATABASE_URL } from "@dashseller/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { disconnectChannel } from "../../channels/disconnect";
import type { SyncContext } from "../../context";
import { systemClock } from "../../context";
import {
  claimOutboxRow,
  claimRecovery,
  listRecoverableRows,
  markSending,
  OutboxTransitionError,
  redispatchFailedRow,
  resetStaleClaims,
  resolveRecovery,
  startReconciliation,
  sweepSendingTimeouts,
} from "../fenced";

let client: ReturnType<typeof createDbClient>;
let ctx: SyncContext;
let organizationId: string;

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
  organizationId = `org-${crypto.randomUUID()}`;
  await client.db.insert(organization).values({
    id: organizationId,
    name: "Outbox Org",
    slug: organizationId,
    createdAt: new Date(),
  });
});

afterAll(async () => {
  await client.close();
});

async function seedRow(
  overrides: Partial<typeof syncOutbox.$inferInsert> = {}
): Promise<{ generation: number; id: string }> {
  const [row] = await client.db
    .insert(syncOutbox)
    .values({
      organizationId,
      channelId: `ch-${crypto.randomUUID()}`,
      entityType: "order",
      entityId: crypto.randomUUID(),
      action: "createShipment",
      payload: { tracking: "T123", carrier: "USPS", lineItems: [] },
      ...overrides,
    })
    .returning({ id: syncOutbox.id, generation: syncOutbox.claimGeneration });
  if (!row) {
    throw new Error("seed failed");
  }
  return row;
}

async function readRow(id: string) {
  const [row] = await client.db
    .select()
    .from(syncOutbox)
    .where(eq(syncOutbox.id, id));
  if (!row) {
    throw new Error("row vanished");
  }
  return row;
}

async function ageRow(id: string, minutes: number) {
  await client.db
    .update(syncOutbox)
    .set({ updatedAt: new Date(Date.now() - minutes * 60 * 1000) })
    .where(eq(syncOutbox.id, id));
}

describe("fenced claims", () => {
  it("claims pending with generation + owner and walks the happy path", async () => {
    const seeded = await seedRow();
    const claim = { rowId: seeded.id, generation: 0, jobId: "job-A" };

    const { row, resumed } = await claimOutboxRow(ctx, claim);
    expect(resumed).toBe(false);
    expect(row.status).toBe("claimed");
    expect(row.claimedByJob).toBe("job-A");
    expect(row.attempts).toBe(1);

    await startReconciliation(ctx, claim);
    await markSending(ctx, claim);
    expect((await readRow(seeded.id)).status).toBe("sending");
  });

  it("a stale retained job (older generation) can never claim a re-pending row", async () => {
    const seeded = await seedRow({ status: "failed" });
    const redispatched = await redispatchFailedRow(ctx, seeded.id);
    expect(redispatched.status).toBe("pending");
    expect(redispatched.claimGeneration).toBe(1);

    // The retained job still holds generation 0.
    await expect(
      claimOutboxRow(ctx, { rowId: seeded.id, generation: 0, jobId: "old-job" })
    ).rejects.toBeInstanceOf(OutboxTransitionError);
    expect((await readRow(seeded.id)).status).toBe("pending");

    // The re-dispatched job with the new generation claims fine.
    const { row } = await claimOutboxRow(ctx, {
      rowId: seeded.id,
      generation: 1,
      jobId: "new-job",
    });
    expect(row.status).toBe("claimed");
  });

  it("the same job resumes its own claim; another job cannot", async () => {
    const seeded = await seedRow();
    const claim = { rowId: seeded.id, generation: 0, jobId: "job-A" };
    await claimOutboxRow(ctx, claim);
    await startReconciliation(ctx, claim);

    // Retry of the same job (same stable id + generation) resumes.
    const { row, resumed } = await claimOutboxRow(ctx, claim);
    expect(resumed).toBe(true);
    expect(row.status).toBe("reconciling");

    // A different claimant no-ops.
    await expect(
      claimOutboxRow(ctx, { rowId: seeded.id, generation: 0, jobId: "job-B" })
    ).rejects.toBeInstanceOf(OutboxTransitionError);
  });
});

describe("sending recovery (two-step)", () => {
  async function seedTimedOutSending() {
    const seeded = await seedRow();
    const claim = { rowId: seeded.id, generation: 0, jobId: "sender" };
    await claimOutboxRow(ctx, claim);
    await startReconciliation(ctx, claim);
    await markSending(ctx, claim);
    await ageRow(seeded.id, 30);
    return seeded;
  }

  it("sweeps timed-out sending rows to reconciliation_required (transition only)", async () => {
    const seeded = await seedTimedOutSending();
    const swept = await sweepSendingTimeouts(ctx, {
      olderThan: new Date(Date.now() - 10 * 60 * 1000),
    });
    expect(swept.some((r) => r.id === seeded.id)).toBe(true);

    const row = await readRow(seeded.id);
    expect(row.status).toBe("reconciliation_required");
    expect(row.claimedByJob).toBeNull();
    expect(row.claimGeneration).toBe(1);

    // The original sender is fenced out.
    await expect(
      markSending(ctx, { rowId: seeded.id, generation: 0, jobId: "sender" })
    ).rejects.toBeInstanceOf(OutboxTransitionError);
  });

  it("a failed enqueue self-heals: the row stays scannable next tick", async () => {
    const seeded = await seedTimedOutSending();
    await sweepSendingTimeouts(ctx, {
      olderThan: new Date(Date.now() - 10 * 60 * 1000),
    });

    const firstScan = await listRecoverableRows(ctx, 100);
    expect(firstScan.some((r) => r.id === seeded.id)).toBe(true);
    // Tick 1's enqueue "failed" — nothing claimed the row. Tick 2 sees it
    // again because dispatch never mutates the row.
    const secondScan = await listRecoverableRows(ctx, 100);
    expect(secondScan.some((r) => r.id === seeded.id)).toBe(true);
  });

  it("recovery found -> confirmed", async () => {
    const seeded = await seedTimedOutSending();
    await sweepSendingTimeouts(ctx, {
      olderThan: new Date(Date.now() - 10 * 60 * 1000),
    });
    const claim = { rowId: seeded.id, generation: 1, jobId: "recover-1" };
    await claimRecovery(ctx, claim);
    await resolveRecovery(ctx, claim, {
      kind: "found",
      externalRef: "F-123",
      correlationMethod: "tracking_match",
    });
    const row = await readRow(seeded.id);
    expect(row.status).toBe("confirmed");
    expect(row.externalRef).toBe("F-123");
  });

  it("recovery absent -> pending with a fresh generation", async () => {
    const seeded = await seedTimedOutSending();
    await sweepSendingTimeouts(ctx, {
      olderThan: new Date(Date.now() - 10 * 60 * 1000),
    });
    const claim = { rowId: seeded.id, generation: 1, jobId: "recover-1" };
    await claimRecovery(ctx, claim);
    await resolveRecovery(ctx, claim, { kind: "absent" });

    const row = await readRow(seeded.id);
    expect(row.status).toBe("pending");
    expect(row.claimedByJob).toBeNull();
    expect(row.claimGeneration).toBe(2);

    // The recovery job's own generation is now stale for further mutations.
    await expect(claimRecovery(ctx, claim)).rejects.toBeInstanceOf(
      OutboxTransitionError
    );
  });

  it("recovery ambiguous -> conflict", async () => {
    const seeded = await seedTimedOutSending();
    await sweepSendingTimeouts(ctx, {
      olderThan: new Date(Date.now() - 10 * 60 * 1000),
    });
    const claim = { rowId: seeded.id, generation: 1, jobId: "recover-1" };
    await claimRecovery(ctx, claim);
    await resolveRecovery(ctx, claim, {
      kind: "ambiguous",
      details: "remote search failed twice",
    });
    const row = await readRow(seeded.id);
    expect(row.status).toBe("conflict");
    expect(row.error).toContain("remote search failed");
  });

  it("a stale recovery claim is returned to the pool by stale reset", async () => {
    const seeded = await seedTimedOutSending();
    await sweepSendingTimeouts(ctx, {
      olderThan: new Date(Date.now() - 10 * 60 * 1000),
    });
    await claimRecovery(ctx, {
      rowId: seeded.id,
      generation: 1,
      jobId: "dead-recover",
    });
    await ageRow(seeded.id, 60);

    const { recoveries } = await resetStaleClaims(ctx, {
      olderThan: new Date(Date.now() - 15 * 60 * 1000),
    });
    expect(recoveries.some((r) => r.id === seeded.id)).toBe(true);
    const row = await readRow(seeded.id);
    expect(row.status).toBe("reconciliation_required");
    expect(row.claimedByJob).toBeNull();
    expect(row.claimGeneration).toBe(2);
  });

  it("stale ordinary claims go back to pending with a bumped generation", async () => {
    const seeded = await seedRow();
    const claim = { rowId: seeded.id, generation: 0, jobId: "dead-job" };
    await claimOutboxRow(ctx, claim);
    await ageRow(seeded.id, 60);

    const { claims } = await resetStaleClaims(ctx, {
      olderThan: new Date(Date.now() - 15 * 60 * 1000),
    });
    expect(claims.some((r) => r.id === seeded.id)).toBe(true);
    const row = await readRow(seeded.id);
    expect(row.status).toBe("pending");
    expect(row.claimGeneration).toBe(1);

    // The dead job cannot reclaim its old row.
    await expect(claimOutboxRow(ctx, claim)).rejects.toBeInstanceOf(
      OutboxTransitionError
    );
  });
});

describe("disconnect generations", () => {
  async function seedChannel() {
    const id = `ch-${crypto.randomUUID()}`;
    await client.db
      .insert(marketplace)
      .values({ id: "ebay", name: "eBay" })
      .onConflictDoNothing();
    const [row] = await client.db
      .insert(channel)
      .values({
        id,
        organizationId,
        marketplaceId: "ebay",
        reference: `seller-${id}`,
        displayName: "Seller",
        connected: true,
      })
      .returning({ id: channel.id, generation: channel.connectionGeneration });
    if (!row) {
      throw new Error("seed failed");
    }
    await client.db.insert(channelWebhookSubscription).values({
      channelId: id,
      topic: "orders/create",
      subscriptionId: "sub-1",
    });
    return row;
  }

  it("disconnects when the generation matches and clears subscriptions", async () => {
    const ch = await seedChannel();
    const outcome = await disconnectChannel(ctx, {
      channelId: ch.id,
      expectedGeneration: ch.generation,
      reason: "app uninstalled",
    });
    expect(outcome.kind).toBe("disconnected");

    const [row] = await client.db
      .select({ connected: channel.connected })
      .from(channel)
      .where(eq(channel.id, ch.id));
    expect(row?.connected).toBe(false);
    const subs = await client.db
      .select()
      .from(channelWebhookSubscription)
      .where(eq(channelWebhookSubscription.channelId, ch.id));
    expect(subs).toHaveLength(0);
  });

  it("ignores a stale uninstall after the seller reconnected", async () => {
    const ch = await seedChannel();
    // Reconnect rotates the generation (P14 does this in the token tx).
    await client.db
      .update(channel)
      .set({ connectionGeneration: crypto.randomUUID() })
      .where(eq(channel.id, ch.id));

    const outcome = await disconnectChannel(ctx, {
      channelId: ch.id,
      expectedGeneration: ch.generation,
      reason: "app uninstalled",
    });
    expect(outcome.kind).toBe("stale-generation");
    const [row] = await client.db
      .select({ connected: channel.connected })
      .from(channel)
      .where(eq(channel.id, ch.id));
    expect(row?.connected).toBe(true);
  });

  it("stale generation still disconnects when remote verification proves the grant dead", async () => {
    const ch = await seedChannel();
    await client.db
      .update(channel)
      .set({ connectionGeneration: crypto.randomUUID() })
      .where(eq(channel.id, ch.id));

    const outcome = await disconnectChannel(ctx, {
      channelId: ch.id,
      expectedGeneration: ch.generation,
      reason: "app uninstalled",
      verifyStillConnected: () => Promise.resolve(false),
    });
    expect(outcome.kind).toBe("disconnected");
  });
});
