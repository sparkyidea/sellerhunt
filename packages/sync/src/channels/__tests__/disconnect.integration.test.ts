import { createDbClient } from "@dashseller/db/client";
import {
  channel,
  channelWebhookSubscription,
  marketplace,
  organization,
} from "@dashseller/db/schema";
import { migrateTestDb, TEST_DATABASE_URL } from "@dashseller/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SyncContext } from "../../context";
import { systemClock } from "../../context";
import { disconnectChannel } from "../disconnect";

let client: ReturnType<typeof createDbClient>;
let ctx: SyncContext;

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

afterAll(async () => {
  await client.close();
});

async function seedConnectedChannel() {
  const suffix = crypto.randomUUID();
  const organizationId = `org-${suffix}`;
  const channelId = `ch-${suffix}`;
  const { db } = client;

  await db.insert(organization).values({
    id: organizationId,
    name: "Test Org",
    slug: organizationId,
    createdAt: new Date(),
  });
  await db
    .insert(marketplace)
    .values({ id: "ebay", name: "eBay" })
    .onConflictDoNothing();
  const [row] = await db
    .insert(channel)
    .values({
      id: channelId,
      organizationId,
      marketplaceId: "ebay",
      reference: `seller-${suffix}`,
      displayName: "Seller",
      connected: true,
    })
    .returning({ connectionGeneration: channel.connectionGeneration });
  if (!row) {
    throw new Error("seed failed");
  }
  await db.insert(channelWebhookSubscription).values({
    channelId,
    topic: "orders/create",
    subscriptionId: `sub-${suffix}`,
  });
  return { channelId, generation: row.connectionGeneration };
}

async function readChannelState(channelId: string) {
  const [row] = await client.db
    .select({ connected: channel.connected })
    .from(channel)
    .where(eq(channel.id, channelId));
  const subscriptions = await client.db
    .select({ id: channelWebhookSubscription.id })
    .from(channelWebhookSubscription)
    .where(eq(channelWebhookSubscription.channelId, channelId));
  return { connected: row?.connected, subscriptions: subscriptions.length };
}

describe("disconnectChannel", () => {
  it("skips the disconnect when the grant verifies alive, even on a matching generation", async () => {
    const { channelId, generation } = await seedConnectedChannel();

    const outcome = await disconnectChannel(ctx, {
      channelId,
      expectedGeneration: generation,
      reason: "delayed app/uninstalled",
      verifyStillConnected: () => Promise.resolve(true),
    });

    expect(outcome.kind).toBe("still-connected");
    expect(await readChannelState(channelId)).toEqual({
      connected: true,
      subscriptions: 1,
    });
  });

  it("disconnects on a verified-dead grant even when the generation is stale", async () => {
    const { channelId } = await seedConnectedChannel();

    const outcome = await disconnectChannel(ctx, {
      channelId,
      expectedGeneration: crypto.randomUUID(),
      reason: "redelivered uninstall",
      verifyStillConnected: () => Promise.resolve(false),
    });

    expect(outcome.kind).toBe("disconnected");
    expect(await readChannelState(channelId)).toEqual({
      connected: false,
      subscriptions: 0,
    });
  });

  it("loses the CAS to a reconnect racing the verification", async () => {
    const { channelId, generation } = await seedConnectedChannel();
    const rotated = crypto.randomUUID();

    const outcome = await disconnectChannel(ctx, {
      channelId,
      expectedGeneration: generation,
      reason: "app/uninstalled",
      // The marketplace says the OLD grant is dead — but by the time the
      // answer arrives, the seller has reconnected: generation rotated and
      // the new connection's subscription rows written. The dead verdict
      // describes the old grant, so the fresh connection must survive.
      verifyStillConnected: async () => {
        await client.db
          .update(channel)
          .set({ connectionGeneration: rotated, connectedAt: new Date() })
          .where(eq(channel.id, channelId));
        await client.db.insert(channelWebhookSubscription).values({
          channelId,
          // Distinct topic — (channel_id, topic) is unique and the old
          // connection's rows are still present in this race.
          topic: "orders/updated",
          subscriptionId: `sub-fresh-${rotated}`,
        });
        return false;
      },
    });

    expect(outcome.kind).toBe("stale-generation");
    // Fresh connection untouched: still connected, BOTH subscription rows
    // (the old one and the reconnect's) intact.
    expect(await readChannelState(channelId)).toEqual({
      connected: true,
      subscriptions: 2,
    });
  });

  it("defers for retry when verification is inconclusive and the generation matches", async () => {
    const { channelId, generation } = await seedConnectedChannel();

    const outcome = await disconnectChannel(ctx, {
      channelId,
      expectedGeneration: generation,
      reason: "app/uninstalled",
      verifyStillConnected: () => Promise.reject(new Error("eBay 503")),
    });

    // The matching generation proves nothing for a delayed event, so
    // neither disconnecting nor dropping is safe — the connection must
    // stay untouched and the caller retries.
    expect(outcome.kind).toBe("verify-inconclusive");
    expect(await readChannelState(channelId)).toEqual({
      connected: true,
      subscriptions: 1,
    });
  });

  it("drops an inconclusive event whose generation no longer matches", async () => {
    const { channelId } = await seedConnectedChannel();

    const outcome = await disconnectChannel(ctx, {
      channelId,
      expectedGeneration: crypto.randomUUID(),
      reason: "app/uninstalled",
      verifyStillConnected: () => Promise.reject(new Error("eBay 503")),
    });

    // Mismatch proves the event predates the current connection.
    expect(outcome.kind).toBe("stale-generation");
    expect(await readChannelState(channelId)).toEqual({
      connected: true,
      subscriptions: 1,
    });
  });

  it("falls back to the generation fence when no verifier is provided", async () => {
    const { channelId, generation } = await seedConnectedChannel();

    const matched = await disconnectChannel(ctx, {
      channelId,
      expectedGeneration: generation,
      reason: "auth-permanent refresh",
    });
    expect(matched.kind).toBe("disconnected");
    expect(await readChannelState(channelId)).toEqual({
      connected: false,
      subscriptions: 0,
    });

    const stale = await disconnectChannel(ctx, {
      channelId,
      expectedGeneration: crypto.randomUUID(),
      reason: "auth-permanent refresh",
    });
    expect(stale.kind).toBe("stale-generation");
  });

  it("answers not-found for unknown channels", async () => {
    const outcome = await disconnectChannel(ctx, {
      channelId: `missing-${crypto.randomUUID()}`,
      expectedGeneration: crypto.randomUUID(),
      reason: "app/uninstalled",
      verifyStillConnected: () => Promise.reject(new Error("eBay 503")),
    });
    expect(outcome.kind).toBe("not-found");
  });
});
