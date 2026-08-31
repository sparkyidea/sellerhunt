import { createDbClient } from "@dashseller/db/client";
import {
  channel,
  channelSyncState,
  marketplace,
  order,
  orderLine,
  orderLineInventoryState,
  organization,
  product,
  productVariant,
  stock,
  stockTransaction,
  warehouse,
} from "@dashseller/db/schema";
import { migrateTestDb, TEST_DATABASE_URL } from "@dashseller/db/testing";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SyncContext } from "../../context";
import { systemClock } from "../../context";
import { applyOrderLineEffects, deriveEffectDeltas } from "../inventory";

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

interface Fixture {
  channelId: string;
  lineId: string;
  organizationId: string;
  productVariantId: string;
  stockId: string;
  warehouseId: string;
}

/** One org/channel/product/variant/warehouse/stock/order/line world. */
async function seedWorld(options?: {
  initialQuantity?: number;
  secondWarehouse?: boolean;
  /** Stamp seed provenance on the stock row (baseline-rule fixture);
   * `observedAtUpper` defaults to `observedAt` (provider-clock exactness). */
  seed?: { basis: string; observedAt: Date; observedAtUpper?: Date };
}): Promise<Fixture & { secondStockId?: string; secondWarehouseId?: string }> {
  const suffix = crypto.randomUUID();
  const { db } = client;
  const organizationId = `org-${suffix}`;
  const channelId = `ch-${suffix}`;

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
  const [wh] = await db
    .insert(warehouse)
    .values({
      organizationId,
      address1: "1 Main St",
      city: "Springfield",
      state: "IL",
      zipcode: "62701",
    })
    .returning({ id: warehouse.id });
  if (!wh) {
    throw new Error("warehouse seed failed");
  }
  const [prod] = await db
    .insert(product)
    .values({ organizationId, title: "Widget", condition: "New" })
    .returning({ id: product.id });
  if (!prod) {
    throw new Error("product seed failed");
  }
  const [variant] = await db
    .insert(productVariant)
    .values({
      organizationId,
      productId: prod.id,
      price: 1000,
      length: 1,
      width: 1,
      height: 1,
      weight: 1,
    })
    .returning({ id: productVariant.id });
  if (!variant) {
    throw new Error("variant seed failed");
  }
  const [stockRow] = await db
    .insert(stock)
    .values({
      organizationId,
      warehouseId: wh.id,
      productVariantId: variant.id,
      quantity: options?.initialQuantity ?? 100,
      seedBasis: options?.seed?.basis ?? null,
      seedObservedAt: options?.seed?.observedAt ?? null,
      seedObservedUpperAt:
        options?.seed?.observedAtUpper ?? options?.seed?.observedAt ?? null,
    })
    .returning({ id: stock.id });
  if (!stockRow) {
    throw new Error("stock seed failed");
  }

  let secondStockId: string | undefined;
  let secondWarehouseId: string | undefined;
  if (options?.secondWarehouse) {
    const [wh2] = await db
      .insert(warehouse)
      .values({
        organizationId,
        address1: "2 Oak Ave",
        city: "Shelbyville",
        state: "IL",
        zipcode: "62565",
      })
      .returning({ id: warehouse.id });
    if (!wh2) {
      throw new Error("warehouse2 seed failed");
    }
    secondWarehouseId = wh2.id;
    const [stock2] = await db
      .insert(stock)
      .values({
        organizationId,
        warehouseId: wh2.id,
        productVariantId: variant.id,
        quantity: 50,
      })
      .returning({ id: stock.id });
    secondStockId = stock2?.id;
  }

  const [orderRow] = await db
    .insert(order)
    .values({
      organizationId,
      channelId,
      reference: `ord-${suffix}`,
    })
    .returning({ id: order.id });
  if (!orderRow) {
    throw new Error("order seed failed");
  }
  const [line] = await db
    .insert(orderLine)
    .values({
      organizationId,
      orderId: orderRow.id,
      reference: "line-1",
      quantity: 5,
      productVariantId: variant.id,
    })
    .returning({ id: orderLine.id });
  if (!line) {
    throw new Error("line seed failed");
  }

  return {
    organizationId,
    channelId,
    warehouseId: wh.id,
    productVariantId: variant.id,
    stockId: stockRow.id,
    lineId: line.id,
    secondStockId,
    secondWarehouseId,
  };
}

function effectInput(
  fx: Fixture,
  overrides: Partial<{
    activeQuantity: number;
    orderedAt: Date | null;
    orderedQuantity: number | null;
    sourceVersionAt: Date | null;
    targetFulfilled: number;
    warehouseId: string | null;
  }> = {}
) {
  return {
    orderLineId: fx.lineId,
    organizationId: fx.organizationId,
    channelId: fx.channelId,
    productVariantId: fx.productVariantId,
    warehouseId: null,
    activeQuantity: 5,
    orderedQuantity: 5,
    targetFulfilled: 0,
    effectRef: null,
    orderedAt: null,
    sourceVersionAt: null,
    ...overrides,
  };
}

async function readState(fx: Fixture) {
  const [stockRow] = await client.db
    .select({
      quantity: stock.quantity,
      reservedQuantity: stock.reservedQuantity,
    })
    .from(stock)
    .where(eq(stock.id, fx.stockId));
  const [stateRow] = await client.db
    .select()
    .from(orderLineInventoryState)
    .where(eq(orderLineInventoryState.orderLineId, fx.lineId));
  return {
    stock: stockRow,
    state: stateRow ?? null,
    reserved: stateRow?.appliedReservedQuantity ?? 0,
    fulfilled: stateRow?.appliedFulfilledQuantity ?? 0,
    released: stateRow?.appliedReleasedQuantity ?? 0,
  };
}

async function readLedger(lineId: string) {
  return await client.db
    .select({
      type: stockTransaction.type,
      quantity: stockTransaction.quantity,
      note: stockTransaction.note,
    })
    .from(stockTransaction)
    .where(eq(stockTransaction.orderLineId, lineId));
}

async function readOrdersSyncError(channelId: string) {
  const [syncState] = await client.db
    .select()
    .from(channelSyncState)
    .where(
      and(
        eq(channelSyncState.channelId, channelId),
        eq(channelSyncState.domain, "orders")
      )
    );
  return syncState?.error ?? null;
}

describe("deriveEffectDeltas (algebra)", () => {
  it("first observation reserves the active quantity", () => {
    const { deltas } = deriveEffectDeltas(
      { reserved: 0, fulfilled: 0, released: 0 },
      { activeQuantity: 5, targetFulfilled: 0 }
    );
    expect(deltas).toEqual({ reserved: 5, fulfilled: 0, released: 0 });
  });

  it("re-derivation from the same snapshot is all-zero", () => {
    const { deltas } = deriveEffectDeltas(
      { reserved: 5, fulfilled: 0, released: 0 },
      { activeQuantity: 5, targetFulfilled: 0 }
    );
    expect(deltas).toEqual({ reserved: 0, fulfilled: 0, released: 0 });
  });

  it("handles quantity edits 5 -> 3 -> 4 with monotonic counters", () => {
    const afterShrink = deriveEffectDeltas(
      { reserved: 5, fulfilled: 0, released: 0 },
      { activeQuantity: 3, targetFulfilled: 0 }
    ).deltas;
    expect(afterShrink).toEqual({ reserved: 0, fulfilled: 0, released: 2 });

    const afterGrow = deriveEffectDeltas(
      { reserved: 5, fulfilled: 0, released: 2 },
      { activeQuantity: 4, targetFulfilled: 0 }
    ).deltas;
    expect(afterGrow).toEqual({ reserved: 1, fulfilled: 0, released: 0 });
  });

  it("handles simultaneous fulfillment + quantity change", () => {
    const { deltas } = deriveEffectDeltas(
      { reserved: 5, fulfilled: 0, released: 0 },
      { activeQuantity: 4, targetFulfilled: 2 }
    );
    expect(deltas).toEqual({ reserved: 0, fulfilled: 2, released: 1 });
  });

  it("handles partial fulfillment", () => {
    const { deltas } = deriveEffectDeltas(
      { reserved: 5, fulfilled: 0, released: 0 },
      { activeQuantity: 5, targetFulfilled: 2 }
    );
    expect(deltas).toEqual({ reserved: 0, fulfilled: 2, released: 0 });
  });

  it("reserves on-the-fly for never-reserved fulfilled lines", () => {
    const { deltas } = deriveEffectDeltas(
      { reserved: 0, fulfilled: 0, released: 0 },
      { activeQuantity: 5, targetFulfilled: 5 }
    );
    expect(deltas).toEqual({ reserved: 5, fulfilled: 5, released: 0 });
  });

  it("flags a shrinking remote cumulative instead of decreasing", () => {
    const { deltas, monotonicityViolated } = deriveEffectDeltas(
      { reserved: 5, fulfilled: 3, released: 0 },
      { activeQuantity: 5, targetFulfilled: 1 }
    );
    expect(monotonicityViolated).toBe(true);
    expect(deltas.fulfilled).toBe(0);
  });

  it("releases only the outstanding remainder on cancel after partial fulfillment", () => {
    const { deltas } = deriveEffectDeltas(
      { reserved: 5, fulfilled: 2, released: 0 },
      { activeQuantity: 0, targetFulfilled: 2 }
    );
    expect(deltas).toEqual({ reserved: 0, fulfilled: 0, released: 3 });
  });

  it("treats unknown fulfillment state (null) as the applied counter", () => {
    const { deltas, monotonicityViolated } = deriveEffectDeltas(
      { reserved: 5, fulfilled: 2, released: 0 },
      { activeQuantity: 0, targetFulfilled: null }
    );
    expect(monotonicityViolated).toBe(false);
    expect(deltas).toEqual({ reserved: 0, fulfilled: 0, released: 3 });
  });

  it("clamps a shrunk target so fulfilled + released <= reserved holds", () => {
    const { deltas, monotonicityViolated } = deriveEffectDeltas(
      { reserved: 5, fulfilled: 2, released: 0 },
      { activeQuantity: 0, targetFulfilled: 0 }
    );
    expect(monotonicityViolated).toBe(true);
    // Never releases more than the true outstanding (5 - 2 - 0 = 3).
    expect(deltas).toEqual({ reserved: 0, fulfilled: 0, released: 3 });
  });
});

describe("applyOrderLineEffects", () => {
  it("applies a first reserve effect end to end", async () => {
    const fx = await seedWorld();
    const outcome = await applyOrderLineEffects(ctx, effectInput(fx));
    expect(outcome.kind).toBe("applied");

    const state = await readState(fx);
    expect(state.reserved).toBe(5);
    expect(state.stock?.reservedQuantity).toBe(5);
    expect(state.stock?.quantity).toBe(100);
    expect(state.state?.stockId).toBe(fx.stockId);

    const ledger = await readLedger(fx.lineId);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]?.type).toBe("reserve");
    expect(ledger[0]?.quantity).toBe(5);
  });

  it("is idempotent for the same snapshot", async () => {
    const fx = await seedWorld();
    await applyOrderLineEffects(ctx, effectInput(fx));
    const second = await applyOrderLineEffects(ctx, effectInput(fx));
    expect(second.kind).toBe("no-op");
    const state = await readState(fx);
    expect(state.reserved).toBe(5);
    expect(state.stock?.reservedQuantity).toBe(5);
  });

  it("nets concurrent identical applications to a single effect", async () => {
    const fx = await seedWorld();
    await Promise.all([
      applyOrderLineEffects(ctx, effectInput(fx)),
      applyOrderLineEffects(ctx, effectInput(fx)),
    ]);
    const state = await readState(fx);
    expect(state.reserved).toBe(5);
    expect(state.stock?.reservedQuantity).toBe(5);
  });

  it("applies distinct transitions in sequence (reserve, then fulfill)", async () => {
    const fx = await seedWorld();
    await applyOrderLineEffects(ctx, effectInput(fx));
    await applyOrderLineEffects(ctx, effectInput(fx, { targetFulfilled: 5 }));
    const state = await readState(fx);
    expect(state.reserved).toBe(5);
    expect(state.fulfilled).toBe(5);
    expect(state.stock?.reservedQuantity).toBe(0);
    expect(state.stock?.quantity).toBe(95);
  });

  it("supports concurrent first effects on lines sharing one stock row", async () => {
    const fx = await seedWorld();
    const [line2] = await client.db
      .insert(orderLine)
      .values({
        organizationId: fx.organizationId,
        orderId: (
          await client.db
            .select({ orderId: orderLine.orderId })
            .from(orderLine)
            .where(eq(orderLine.id, fx.lineId))
        )[0]?.orderId,
        reference: "line-2",
        quantity: 3,
        productVariantId: fx.productVariantId,
      })
      .returning({ id: orderLine.id });
    if (!line2) {
      throw new Error("line2 seed failed");
    }

    await Promise.all([
      applyOrderLineEffects(ctx, effectInput(fx)),
      applyOrderLineEffects(ctx, {
        ...effectInput(fx, { activeQuantity: 3 }),
        orderLineId: line2.id,
      }),
    ]);

    const state = await readState(fx);
    expect(state.stock?.reservedQuantity).toBe(8);
  });

  it("records a conflict, applies nothing, and leaves NO state row on ambiguous stock", async () => {
    const fx = await seedWorld({ secondWarehouse: true });
    const outcome = await applyOrderLineEffects(ctx, effectInput(fx));
    expect(outcome.kind).toBe("conflict");

    const state = await readState(fx);
    expect(state.stock?.reservedQuantity).toBe(0);
    expect(state.state).toBeNull();
    expect(await readOrdersSyncError(fx.channelId)).toContain(
      "multiple candidate stock rows"
    );
  });

  it("uses the line's warehouse to disambiguate stock", async () => {
    const fx = await seedWorld({ secondWarehouse: true });
    const outcome = await applyOrderLineEffects(
      ctx,
      effectInput(fx, { warehouseId: fx.warehouseId })
    );
    expect(outcome.kind).toBe("applied");
    const state = await readState(fx);
    expect(state.stock?.reservedQuantity).toBe(5);
  });

  it("does not re-apply pre-seeded counters", async () => {
    const fx = await seedWorld();
    // Pre-existing state (e.g. an operator fix): the pin and a reserve of 5
    // that historical stock numbers already include.
    await client.db.insert(orderLineInventoryState).values({
      orderLineId: fx.lineId,
      stockId: fx.stockId,
      organizationId: fx.organizationId,
      appliedReservedQuantity: 5,
    });

    const outcome = await applyOrderLineEffects(ctx, effectInput(fx));
    expect(outcome.kind).toBe("no-op");
    const state = await readState(fx);
    expect(state.stock?.reservedQuantity).toBe(0);
    expect(state.stock?.quantity).toBe(100);
  });

  it("clamps stock reservation at zero and records the conflict", async () => {
    const fx = await seedWorld();
    // Pre-seeded counters say reserved 5, but the stock row never carried
    // the reservation. A fulfillment then subtracts more reservation than
    // the row holds.
    await client.db.insert(orderLineInventoryState).values({
      orderLineId: fx.lineId,
      stockId: fx.stockId,
      organizationId: fx.organizationId,
      appliedReservedQuantity: 5,
    });

    const outcome = await applyOrderLineEffects(
      ctx,
      effectInput(fx, { targetFulfilled: 5 })
    );
    expect(outcome.kind).toBe("applied");
    const state = await readState(fx);
    expect(state.stock?.reservedQuantity).toBe(0);
    expect(state.stock?.quantity).toBe(95);
    expect(await readOrdersSyncError(fx.channelId)).toContain("clamped");
  });
});

describe("applyOrderLineEffects (baseline rule)", () => {
  const seedT = new Date("2026-01-15T12:00:00.000Z");
  const before = new Date("2026-01-15T11:00:00.000Z");
  const after = new Date("2026-01-15T13:00:00.000Z");
  const seeded = {
    initialQuantity: 10,
    seed: { basis: "listing_available", observedAt: seedT },
  };

  it("open pre-baseline order: uplifts and reserves without draining availability", async () => {
    const fx = await seedWorld(seeded);
    const outcome = await applyOrderLineEffects(
      ctx,
      effectInput(fx, { orderedAt: before })
    );
    expect(outcome.kind).toBe("applied");
    if (outcome.kind === "applied") {
      expect(outcome.baselineUplift).toBe(5);
    }

    const state = await readState(fx);
    expect(state.stock?.quantity).toBe(15);
    expect(state.stock?.reservedQuantity).toBe(5);
    expect(state.reserved).toBe(5);

    const ledger = await readLedger(fx.lineId);
    const byType = Object.fromEntries(
      ledger.map((row) => [row.type, row.quantity])
    );
    expect(byType.adjust).toBe(5);
    expect(byType.reserve).toBe(5);
    expect(ledger.find((row) => row.type === "adjust")?.note).toContain(
      "Baseline uplift"
    );
  });

  it("shipped pre-baseline order: quantity unchanged, ledger carries adjust + fulfill", async () => {
    const fx = await seedWorld(seeded);
    const outcome = await applyOrderLineEffects(
      ctx,
      effectInput(fx, { orderedAt: before, targetFulfilled: 5 })
    );
    expect(outcome.kind).toBe("applied");

    const state = await readState(fx);
    expect(state.stock?.quantity).toBe(10);
    expect(state.stock?.reservedQuantity).toBe(0);

    const ledger = await readLedger(fx.lineId);
    const byType = Object.fromEntries(
      ledger.map((row) => [row.type, row.quantity])
    );
    expect(byType.adjust).toBe(5);
    expect(byType.fulfill).toBe(5);
  });

  it("partially shipped pre-baseline order: on hand covers the outstanding", async () => {
    const fx = await seedWorld(seeded);
    await applyOrderLineEffects(
      ctx,
      effectInput(fx, { orderedAt: before, targetFulfilled: 2 })
    );

    const state = await readState(fx);
    expect(state.stock?.quantity).toBe(13);
    expect(state.stock?.reservedQuantity).toBe(3);
  });

  it("open pre-baseline order that later ships: no second uplift", async () => {
    const fx = await seedWorld(seeded);
    await applyOrderLineEffects(ctx, effectInput(fx, { orderedAt: before }));
    await applyOrderLineEffects(
      ctx,
      effectInput(fx, { orderedAt: before, targetFulfilled: 5 })
    );

    const state = await readState(fx);
    expect(state.stock?.quantity).toBe(10);
    expect(state.stock?.reservedQuantity).toBe(0);

    const ledger = await readLedger(fx.lineId);
    const adjusts = ledger.filter((row) => row.type === "adjust");
    expect(adjusts).toHaveLength(1);
  });

  it("open pre-baseline order that later cancels: eBay's restore is mirrored", async () => {
    const fx = await seedWorld(seeded);
    await applyOrderLineEffects(ctx, effectInput(fx, { orderedAt: before }));
    await applyOrderLineEffects(
      ctx,
      effectInput(fx, { orderedAt: before, activeQuantity: 0 })
    );

    const state = await readState(fx);
    expect(state.stock?.quantity).toBe(15);
    expect(state.stock?.reservedQuantity).toBe(0);

    const ledger = await readLedger(fx.lineId);
    const byType = Object.fromEntries(
      ledger.map((row) => [row.type, row.quantity])
    );
    expect(byType.release).toBe(5);
  });

  it("post-baseline order: normal rule, no adjust", async () => {
    const fx = await seedWorld(seeded);
    const outcome = await applyOrderLineEffects(
      ctx,
      effectInput(fx, { orderedAt: after })
    );
    expect(outcome.kind).toBe("applied");
    if (outcome.kind === "applied") {
      expect(outcome.baselineUplift).toBe(0);
    }

    const state = await readState(fx);
    expect(state.stock?.quantity).toBe(10);
    expect(state.stock?.reservedQuantity).toBe(5);

    const ledger = await readLedger(fx.lineId);
    expect(ledger.some((row) => row.type === "adjust")).toBe(false);
  });

  it("manual stock (no seed provenance): normal rule, no conflict", async () => {
    const fx = await seedWorld({ initialQuantity: 10 });
    const outcome = await applyOrderLineEffects(
      ctx,
      effectInput(fx, { orderedAt: before })
    );
    expect(outcome.kind).toBe("applied");
    if (outcome.kind === "applied") {
      expect(outcome.baselineUplift).toBe(0);
      expect(outcome.conflictsRecorded).toBe(0);
    }

    const state = await readState(fx);
    expect(state.stock?.quantity).toBe(10);
    expect(state.stock?.reservedQuantity).toBe(5);
    expect(await readOrdersSyncError(fx.channelId)).toBeNull();
  });

  it("null orderedAt on seeded stock: normal rule plus a recorded conflict", async () => {
    const fx = await seedWorld(seeded);
    const outcome = await applyOrderLineEffects(
      ctx,
      effectInput(fx, { orderedAt: null })
    );
    expect(outcome.kind).toBe("applied");
    if (outcome.kind === "applied") {
      expect(outcome.baselineUplift).toBe(0);
    }

    const state = await readState(fx);
    expect(state.stock?.quantity).toBe(10);
    expect(state.stock?.reservedQuantity).toBe(5);
    expect(await readOrdersSyncError(fx.channelId)).toContain(
      "baseline rule skipped"
    );
  });

  it("Invalid Date orderedAt on seeded stock: normal rule plus a recorded conflict", async () => {
    const fx = await seedWorld(seeded);
    const outcome = await applyOrderLineEffects(
      ctx,
      effectInput(fx, { orderedAt: new Date(Number.NaN) })
    );
    expect(outcome.kind).toBe("applied");
    if (outcome.kind === "applied") {
      expect(outcome.baselineUplift).toBe(0);
    }
    expect(await readOrdersSyncError(fx.channelId)).toContain(
      "baseline rule skipped"
    );
  });

  it("concurrent first-touch of the same line uplifts exactly once", async () => {
    const fx = await seedWorld(seeded);
    await Promise.all([
      applyOrderLineEffects(ctx, effectInput(fx, { orderedAt: before })),
      applyOrderLineEffects(ctx, effectInput(fx, { orderedAt: before })),
    ]);

    const state = await readState(fx);
    expect(state.stock?.quantity).toBe(15);
    expect(state.stock?.reservedQuantity).toBe(5);
    expect(state.reserved).toBe(5);

    const ledger = await readLedger(fx.lineId);
    const adjusts = ledger.filter((row) => row.type === "adjust");
    expect(adjusts).toHaveLength(1);
    expect(adjusts[0]?.quantity).toBe(5);
  });

  it("canceled before first pull with a post-seed restore: uplift mirrors the marketplace restore", async () => {
    const fx = await seedWorld(seeded);
    const outcome = await applyOrderLineEffects(
      ctx,
      effectInput(fx, {
        activeQuantity: 0,
        orderedAt: before,
        sourceVersionAt: after,
      })
    );
    expect(outcome.kind).toBe("applied");
    if (outcome.kind === "applied") {
      expect(outcome.baselineUplift).toBe(5);
    }

    const state = await readState(fx);
    expect(state.stock?.quantity).toBe(15);
    expect(state.stock?.reservedQuantity).toBe(0);
    expect(state.reserved).toBe(5);
    expect(state.released).toBe(5);

    const ledger = await readLedger(fx.lineId);
    const adjusts = ledger.filter((row) => row.type === "adjust");
    expect(adjusts).toHaveLength(1);
    expect(adjusts[0]?.quantity).toBe(5);

    // Replay of the same terminal snapshot nets to zero.
    const replay = await applyOrderLineEffects(
      ctx,
      effectInput(fx, {
        activeQuantity: 0,
        orderedAt: before,
        sourceVersionAt: after,
      })
    );
    expect(replay.kind).toBe("no-op");
    const stateAfter = await readState(fx);
    expect(stateAfter.stock?.quantity).toBe(15);
    expect(await readLedger(fx.lineId)).toHaveLength(ledger.length);
  });

  it("canceled with a pre-seed restore: already inside the seed, nothing to add", async () => {
    const fx = await seedWorld(seeded);
    const preSeedModified = new Date("2026-01-15T11:30:00.000Z");
    const outcome = await applyOrderLineEffects(
      ctx,
      effectInput(fx, {
        activeQuantity: 0,
        orderedAt: before,
        sourceVersionAt: preSeedModified,
      })
    );
    expect(outcome.kind).toBe("no-op");

    const state = await readState(fx);
    expect(state.stock?.quantity).toBe(10);
    expect(state.stock?.reservedQuantity).toBe(0);
    expect(await readLedger(fx.lineId)).toHaveLength(0);
    expect(await readOrdersSyncError(fx.channelId)).toBeNull();
  });

  it("edited down before first pull with a post-seed restore: full original quantity uplifted", async () => {
    const fx = await seedWorld(seeded);
    const outcome = await applyOrderLineEffects(
      ctx,
      effectInput(fx, {
        activeQuantity: 3,
        orderedAt: before,
        sourceVersionAt: after,
      })
    );
    expect(outcome.kind).toBe("applied");
    if (outcome.kind === "applied") {
      expect(outcome.baselineUplift).toBe(5);
    }

    const state = await readState(fx);
    // 3 outstanding stay reserved; the 2 edited-away units were restored
    // by the marketplace after the seed, so they land as free stock.
    expect(state.stock?.quantity).toBe(15);
    expect(state.stock?.reservedQuantity).toBe(3);
    expect(state.reserved).toBe(5);
    expect(state.released).toBe(2);
  });

  it("partially fulfilled then canceled with a post-seed restore: only unshipped units restore", async () => {
    const fx = await seedWorld(seeded);
    const outcome = await applyOrderLineEffects(
      ctx,
      effectInput(fx, {
        activeQuantity: 0,
        targetFulfilled: 2,
        orderedAt: before,
        sourceVersionAt: after,
      })
    );
    expect(outcome.kind).toBe("applied");
    if (outcome.kind === "applied") {
      expect(outcome.baselineUplift).toBe(5);
    }

    const state = await readState(fx);
    // Uplift 5 (all were netted out of the seed), fulfill keeps 2 gone:
    // 10 + 5 − 2 = 13 on hand, nothing reserved.
    expect(state.stock?.quantity).toBe(13);
    expect(state.stock?.reservedQuantity).toBe(0);
    expect(state.reserved).toBe(5);
    expect(state.fulfilled).toBe(2);
    expect(state.released).toBe(3);
  });

  it("restore inside the fallback fetch window classifies pre-seed: no uplift", async () => {
    // App-clock fallback: the observation happened somewhere in
    // [lower, upper]. A restore stamped inside that window may already be
    // inside the seeded quantity — uplifting would oversell.
    const upper = new Date("2026-01-15T12:10:00.000Z");
    const inWindow = new Date("2026-01-15T12:05:00.000Z");
    const fx = await seedWorld({
      initialQuantity: 10,
      seed: {
        basis: "listing_available",
        observedAt: seedT,
        observedAtUpper: upper,
      },
    });
    const outcome = await applyOrderLineEffects(
      ctx,
      effectInput(fx, {
        activeQuantity: 0,
        orderedAt: before,
        sourceVersionAt: inWindow,
      })
    );
    expect(outcome.kind).toBe("no-op");

    const state = await readState(fx);
    expect(state.stock?.quantity).toBe(10);
    expect(await readLedger(fx.lineId)).toHaveLength(0);

    // A restore strictly after the upper bound still uplifts.
    const fx2 = await seedWorld({
      initialQuantity: 10,
      seed: {
        basis: "listing_available",
        observedAt: seedT,
        observedAtUpper: upper,
      },
    });
    const afterUpper = new Date("2026-01-15T12:15:00.000Z");
    const outcome2 = await applyOrderLineEffects(
      ctx,
      effectInput(fx2, {
        activeQuantity: 0,
        orderedAt: before,
        sourceVersionAt: afterUpper,
      })
    );
    expect(outcome2.kind).toBe("applied");
    const state2 = await readState(fx2);
    expect(state2.stock?.quantity).toBe(15);
  });

  it("restore timing unknown: no uplift, conflict recorded", async () => {
    const fx = await seedWorld(seeded);
    const outcome = await applyOrderLineEffects(
      ctx,
      effectInput(fx, {
        activeQuantity: 0,
        orderedAt: before,
        sourceVersionAt: null,
      })
    );
    expect(outcome.kind).toBe("no-op");
    expect(outcome.conflictsRecorded).toBe(1);

    const state = await readState(fx);
    expect(state.stock?.quantity).toBe(10);
    expect(await readOrdersSyncError(fx.channelId)).toContain(
      "restore timing unknown"
    );
  });
});
