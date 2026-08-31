import { createDbClient } from "@dashseller/db/client";
import {
  channel,
  marketplace,
  order,
  organization,
  syncOutbox,
} from "@dashseller/db/schema";
import { migrateTestDb, TEST_DATABASE_URL } from "@dashseller/db/testing";
import type {
  ApiClient,
  ShippingFulfillment,
} from "@dashseller/marketplace/types";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SyncContext } from "../../context";
import { systemClock } from "../../context";
import { createOrdersUpsertPorts } from "../order-ports";

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

/** ApiClient stub: only `getFulfillments` is reachable from the ports. */
function stubApiClient(
  getFulfillments: (orderId: string) => Promise<ShippingFulfillment[]>
): ApiClient {
  const unreachable = () => {
    throw new Error("not used in this test");
  };
  return {
    createFulfillment: unreachable,
    getChannel: unreachable,
    getFulfillments,
    getListings: unreachable,
    getOrders: unreachable,
    refresh: unreachable,
  };
}

function fulfillment(reference: string): ShippingFulfillment {
  return {
    carrier: "USPS",
    clientReferenceId: null,
    lineItems: [],
    method: null,
    reference,
    shippedAt: "2026-08-15T12:00:00Z",
    tracking: null,
  };
}

async function seedAwaitingRow(params: { updatedAt?: Date } = {}) {
  const suffix = crypto.randomUUID();
  const organizationId = `org-${suffix}`;
  const channelId = `ch-${suffix}`;
  const reference = `ord-${suffix}`;
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
  await db.insert(channel).values({
    id: channelId,
    organizationId,
    marketplaceId: "ebay",
    reference: `seller-${suffix}`,
    displayName: "Seller",
    connected: true,
  });
  const [orderRow] = await db
    .insert(order)
    .values({ organizationId, channelId, reference })
    .returning({ id: order.id });
  if (!orderRow) {
    throw new Error("seed failed");
  }
  const [outboxRow] = await db
    .insert(syncOutbox)
    .values({
      organizationId,
      channelId,
      entityType: "order",
      entityId: orderRow.id,
      action: "createShipment",
      payload: {},
      status: "awaiting_confirmation",
      externalRef: `F-${suffix}`,
      ...(params.updatedAt ? { updatedAt: params.updatedAt } : {}),
    })
    .returning({ id: syncOutbox.id, externalRef: syncOutbox.externalRef });
  if (!outboxRow?.externalRef) {
    throw new Error("seed failed");
  }
  return {
    channelId,
    externalRef: outboxRow.externalRef,
    orderId: orderRow.id,
    outboxId: outboxRow.id,
    reference,
  };
}

async function readOutboxRow(outboxId: string) {
  const [row] = await client.db
    .select({
      status: syncOutbox.status,
      confirmedAt: syncOutbox.confirmedAt,
      remoteSnapshot: syncOutbox.remoteSnapshot,
    })
    .from(syncOutbox)
    .where(eq(syncOutbox.id, outboxId));
  if (!row) {
    throw new Error("outbox row vanished");
  }
  return row;
}

describe("createOrdersUpsertPorts", () => {
  it("reports in-flight orders as protected", async () => {
    const world = await seedAwaitingRow();
    const ports = createOrdersUpsertPorts(
      ctx,
      stubApiClient(() => Promise.resolve([]))
    );

    const protectedIds = await ports.getProtectedEntityIds?.([world.orderId]);
    expect(protectedIds).toEqual(new Set([world.orderId]));
  });

  it("confirms an awaiting row when the pushed fulfillment is visible", async () => {
    const world = await seedAwaitingRow();
    const ports = createOrdersUpsertPorts(
      ctx,
      stubApiClient(() => Promise.resolve([fulfillment(world.externalRef)]))
    );

    const deferred = await ports.captureRemoteEvidence?.(
      new Set([world.orderId]),
      [{ id: world.orderId, reference: world.reference }],
      []
    );

    expect(deferred).toEqual([]);
    const row = await readOutboxRow(world.outboxId);
    expect(row.status).toBe("confirmed");
    expect(row.confirmedAt).not.toBeNull();
    expect(row.remoteSnapshot).not.toBeNull();
  });

  it("defers a young row whose fulfillment is not yet visible", async () => {
    const world = await seedAwaitingRow();
    const ports = createOrdersUpsertPorts(
      ctx,
      // Successful read, no match — eventual-consistency lag.
      stubApiClient(() => Promise.resolve([]))
    );

    const deferred = await ports.captureRemoteEvidence?.(
      new Set([world.orderId]),
      [{ id: world.orderId, reference: world.reference }],
      []
    );

    // Must surface as a run error so the retry/watermark machinery
    // re-checks before the 60-min sweep can escalate a landed push.
    expect(deferred).toHaveLength(1);
    expect(deferred?.[0]?.reference).toBe(world.reference);
    expect(deferred?.[0]?.error).toContain("not yet visible");
    expect((await readOutboxRow(world.outboxId)).status).toBe(
      "awaiting_confirmation"
    );
  });

  it("goes quiet on an old unevidenced row and leaves it to the sweep", async () => {
    const world = await seedAwaitingRow({
      updatedAt: new Date(Date.now() - 45 * 60 * 1000),
    });
    const ports = createOrdersUpsertPorts(
      ctx,
      stubApiClient(() => Promise.resolve([]))
    );

    const deferred = await ports.captureRemoteEvidence?.(
      new Set([world.orderId]),
      [{ id: world.orderId, reference: world.reference }],
      []
    );

    // Past the retry window the run must not keep failing — a genuinely
    // vanished remote fulfillment would hold the channel watermark
    // hostage; the conflict sweep is the bounded escalation.
    expect(deferred).toEqual([]);
    expect((await readOutboxRow(world.outboxId)).status).toBe(
      "awaiting_confirmation"
    );
  });

  it("defers instead of throwing when the fulfillment fetch fails", async () => {
    const world = await seedAwaitingRow();
    const ports = createOrdersUpsertPorts(
      ctx,
      stubApiClient(() => Promise.reject(new Error("eBay 503")))
    );

    const deferred = await ports.captureRemoteEvidence?.(
      new Set([world.orderId]),
      [{ id: world.orderId, reference: world.reference }],
      []
    );

    expect(deferred).toHaveLength(1);
    expect(deferred?.[0]?.error).toContain("eBay 503");
    expect((await readOutboxRow(world.outboxId)).status).toBe(
      "awaiting_confirmation"
    );
  });
});
