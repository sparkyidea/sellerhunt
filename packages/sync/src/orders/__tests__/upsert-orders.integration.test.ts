import { createDbClient } from "@dashseller/db/client";
import {
  channel,
  listing,
  listingVariant,
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
import type { Order } from "@dashseller/marketplace/types";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SyncContext } from "../../context";
import { systemClock } from "../../context";
import { upsertOrders } from "../upsert-orders";

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

const EMPTY_ADDRESS = {
  name: null,
  company: null,
  email: null,
  phone: null,
  address1: null,
  address2: null,
  city: null,
  state: null,
  zipCode: null,
  countryCode: null,
};

function snapshot(params: {
  activeQuantity?: number;
  lineListingVariantReference?: string | null;
  note?: string | null;
  orderedAt?: Date;
  quantity?: number;
  reference: string;
  sourceVersionAt: Date | null;
  targetStatus?: Order["status"];
}): Order {
  const quantity = params.quantity ?? 5;
  return {
    reference: params.reference,
    orderNumber: null,
    customerUsername: null,
    billing: EMPTY_ADDRESS,
    shipping: EMPTY_ADDRESS,
    subtotal: null,
    shippingCost: null,
    discount: null,
    tax: null,
    total: null,
    currency: "USD",
    orderedAt: params.orderedAt ?? new Date("2026-08-01T00:00:00Z"),
    status: params.targetStatus ?? "unfulfilled",
    paid: true,
    paidAt: null,
    paymentMethod: null,
    shipped: false,
    shippedAt: null,
    shipBy: null,
    deliverBy: null,
    deliveredAt: null,
    requestedShippingCarrier: null,
    requestedShippingMethod: null,
    customerNote: params.note ?? null,
    sellerNote: null,
    cancelState: null,
    cancellationReason: null,
    sourceVersionAt: params.sourceVersionAt,
    orderLines: [
      {
        reference: "line-1",
        title: "Widget",
        quantity,
        activeQuantity: params.activeQuantity ?? quantity,
        sku: null,
        unitPrice: null,
        discount: null,
        tax: null,
        total: null,
        listingVariantReference: params.lineListingVariantReference ?? null,
      },
    ],
  };
}

async function seedChannelWorld(options?: {
  stockQuantity?: number;
  stockSeed?: { basis: string; observedAt: Date };
}) {
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
  const [prod] = await db
    .insert(product)
    .values({ organizationId, title: "Widget", condition: "New" })
    .returning({ id: product.id });
  if (!(wh && prod)) {
    throw new Error("seed failed");
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
    throw new Error("seed failed");
  }
  const [stockRow] = await db
    .insert(stock)
    .values({
      organizationId,
      warehouseId: wh.id,
      productVariantId: variant.id,
      quantity: options?.stockQuantity ?? 100,
      seedBasis: options?.stockSeed?.basis ?? null,
      seedObservedAt: options?.stockSeed?.observedAt ?? null,
    })
    .returning({ id: stock.id });
  if (!stockRow) {
    throw new Error("seed failed");
  }

  return {
    organizationId,
    channelId,
    productVariantId: variant.id,
    stockId: stockRow.id,
  };
}

async function attachVariantToLine(
  channelId: string,
  orderReference: string,
  productVariantId: string
): Promise<string> {
  const [orderRow] = await client.db
    .select({ id: order.id })
    .from(order)
    .where(
      and(eq(order.channelId, channelId), eq(order.reference, orderReference))
    );
  if (!orderRow) {
    throw new Error("order not found");
  }
  await client.db
    .update(orderLine)
    .set({ productVariantId })
    .where(eq(orderLine.orderId, orderRow.id));
  const [line] = await client.db
    .select({ id: orderLine.id })
    .from(orderLine)
    .where(eq(orderLine.orderId, orderRow.id));
  if (!line) {
    throw new Error("line not found");
  }
  return line.id;
}

async function readCounters(lineId: string): Promise<{
  fulfilled?: number;
  released?: number;
  reserved?: number;
}> {
  const [state] = await client.db
    .select()
    .from(orderLineInventoryState)
    .where(eq(orderLineInventoryState.orderLineId, lineId));
  if (!state) {
    return {};
  }
  return {
    reserved: state.appliedReservedQuantity,
    fulfilled: state.appliedFulfilledQuantity,
    released: state.appliedReleasedQuantity,
  };
}

describe("upsertOrders", () => {
  it("rejects stale snapshots and aborts all child writes", async () => {
    const world = await seedChannelWorld();
    const reference = `ord-${crypto.randomUUID()}`;
    const t2 = new Date("2026-08-02T12:00:00Z");
    const t1 = new Date("2026-08-01T12:00:00Z");

    const fresh = await upsertOrders(ctx, {
      channelId: world.channelId,
      orders: [
        snapshot({ reference, sourceVersionAt: t2, note: "v2", quantity: 5 }),
      ],
    });
    expect(fresh.staleRejected).toBe(0);
    const lineId = await attachVariantToLine(
      world.channelId,
      reference,
      world.productVariantId
    );

    const stale = await upsertOrders(ctx, {
      channelId: world.channelId,
      orders: [
        snapshot({
          reference,
          sourceVersionAt: t1,
          note: "v1",
          quantity: 3,
          activeQuantity: 3,
        }),
      ],
    });
    expect(stale.staleRejected).toBe(1);

    const [orderRow] = await client.db
      .select({ customerNote: order.customerNote })
      .from(order)
      .where(
        and(
          eq(order.channelId, world.channelId),
          eq(order.reference, reference)
        )
      );
    expect(orderRow?.customerNote).toBe("v2");

    const [lineRow] = await client.db
      .select({ quantity: orderLine.quantity })
      .from(orderLine)
      .where(eq(orderLine.id, lineId));
    expect(lineRow?.quantity).toBe(5);

    // No inventory effects from the stale snapshot either.
    const counters = await readCounters(lineId);
    expect(counters.released ?? 0).toBe(0);
  });

  it("nets concurrent identical batches to one inventory effect", async () => {
    const world = await seedChannelWorld();
    const reference = `ord-${crypto.randomUUID()}`;
    const t1 = new Date("2026-08-01T12:00:00Z");

    await upsertOrders(ctx, {
      channelId: world.channelId,
      orders: [snapshot({ reference, sourceVersionAt: t1 })],
    });
    const lineId = await attachVariantToLine(
      world.channelId,
      reference,
      world.productVariantId
    );

    const snap = snapshot({ reference, sourceVersionAt: t1 });
    await Promise.all([
      upsertOrders(ctx, { channelId: world.channelId, orders: [snap] }),
      upsertOrders(ctx, { channelId: world.channelId, orders: [snap] }),
    ]);

    const counters = await readCounters(lineId);
    expect(counters.reserved).toBe(5);
  });

  it("skips inventory for orders whose fulfillment fetch failed", async () => {
    const world = await seedChannelWorld();
    const reference = `ord-${crypto.randomUUID()}`;
    const t1 = new Date("2026-08-01T12:00:00Z");

    await upsertOrders(ctx, {
      channelId: world.channelId,
      orders: [snapshot({ reference, sourceVersionAt: t1 })],
    });
    const lineId = await attachVariantToLine(
      world.channelId,
      reference,
      world.productVariantId
    );

    const result = await upsertOrders(ctx, {
      channelId: world.channelId,
      orders: [
        snapshot({
          reference,
          sourceVersionAt: t1,
          targetStatus: "fulfilled",
        }),
      ],
      ports: {
        getFulfillments: () => Promise.reject(new Error("eBay 503")),
      },
    });

    expect(result.errors.some((e) => e.error.includes("eBay 503"))).toBe(true);
    // Inventory untouched — no counters were created for the skipped order.
    const counters = await readCounters(lineId);
    expect(Object.keys(counters)).toHaveLength(0);
  });

  it("protects in-flight orders without tripping a text/uuid operator", async () => {
    const world = await seedChannelWorld();
    const reference = `ord-${crypto.randomUUID()}`;
    const t1 = new Date("2026-08-01T12:00:00Z");

    await upsertOrders(ctx, {
      channelId: world.channelId,
      orders: [snapshot({ reference, sourceVersionAt: t1 })],
    });
    const [seeded] = await client.db
      .select({ id: order.id })
      .from(order)
      .where(
        and(
          eq(order.channelId, world.channelId),
          eq(order.reference, reference)
        )
      );
    if (!seeded) {
      throw new Error("seed failed");
    }

    // `order.id` is text while `sync_outbox.entity_id` is uuid — a uuid-cast
    // protected array makes the whole upsert throw 42883.
    const result = await upsertOrders(ctx, {
      channelId: world.channelId,
      orders: [
        snapshot({
          reference,
          sourceVersionAt: new Date("2026-08-03T12:00:00Z"),
          targetStatus: "fulfilled",
        }),
      ],
      ports: {
        getProtectedEntityIds: () => Promise.resolve(new Set([seeded.id])),
      },
    });

    expect(result.errors).toEqual([]);
    expect(result.totalProcessed).toBe(1);

    // The protected field kept its local value instead of the pulled one.
    const [row] = await client.db
      .select({ status: order.status })
      .from(order)
      .where(eq(order.id, seeded.id));
    expect(row?.status).toBe("unfulfilled");
  });

  it("surfaces a failed evidence capture as a retryable run error", async () => {
    const world = await seedChannelWorld();
    const reference = `ord-${crypto.randomUUID()}`;

    await upsertOrders(ctx, {
      channelId: world.channelId,
      orders: [
        snapshot({
          reference,
          sourceVersionAt: new Date("2026-08-01T12:00:00Z"),
        }),
      ],
    });
    const [seeded] = await client.db
      .select({ id: order.id })
      .from(order)
      .where(
        and(
          eq(order.channelId, world.channelId),
          eq(order.reference, reference)
        )
      );
    if (!seeded) {
      throw new Error("seed failed");
    }

    const result = await upsertOrders(ctx, {
      channelId: world.channelId,
      orders: [
        snapshot({
          reference,
          sourceVersionAt: new Date("2026-08-04T12:00:00Z"),
        }),
      ],
      ports: {
        getProtectedEntityIds: () => Promise.resolve(new Set([seeded.id])),
        captureRemoteEvidence: () =>
          Promise.resolve([
            { reference, error: "outbox confirmation deferred: eBay 503" },
          ]),
      },
    });

    // Reported, not swallowed — the caller holds the watermark and retries
    // instead of letting the conflict sweep escalate a landed push.
    expect(result.errors.some((e) => e.error.includes("eBay 503"))).toBe(true);
  });

  it("walks quantity edits 5 -> 3 -> 4 through the full pipeline", async () => {
    const world = await seedChannelWorld();
    const reference = `ord-${crypto.randomUUID()}`;

    await upsertOrders(ctx, {
      channelId: world.channelId,
      orders: [
        snapshot({
          reference,
          sourceVersionAt: new Date("2026-08-01T00:00:00Z"),
        }),
      ],
    });
    const lineId = await attachVariantToLine(
      world.channelId,
      reference,
      world.productVariantId
    );

    for (const [i, quantity] of [5, 3, 4].entries()) {
      await upsertOrders(ctx, {
        channelId: world.channelId,
        orders: [
          snapshot({
            reference,
            quantity,
            sourceVersionAt: new Date(`2026-08-0${i + 2}T00:00:00Z`),
          }),
        ],
      });
    }

    const counters = await readCounters(lineId);
    expect(counters.reserved).toBe(6);
    expect(counters.released).toBe(2);

    const [stockRow] = await client.db
      .select({ reservedQuantity: stock.reservedQuantity })
      .from(stock)
      .where(eq(stock.productVariantId, world.productVariantId));
    expect(stockRow?.reservedQuantity).toBe(4);
  });

  it("a fresh ref-less snapshot clears an unresolved line's stale reference", async () => {
    const world = await seedChannelWorld();
    const reference = `ord-${crypto.randomUUID()}`;
    const lvRef = `lv-${crypto.randomUUID()}`;

    // Line stored with a reference that will never resolve (variant later
    // deleted remotely).
    await upsertOrders(ctx, {
      channelId: world.channelId,
      orders: [
        snapshot({
          reference,
          sourceVersionAt: new Date("2026-08-01T12:00:00Z"),
          lineListingVariantReference: lvRef,
        }),
      ],
    });

    // The re-pull returns the line WITHOUT a variant reference — the
    // marketplace no longer links it. The stale stored reference must go,
    // or relink re-enqueues this order after every listings run forever.
    await upsertOrders(ctx, {
      channelId: world.channelId,
      orders: [
        snapshot({
          reference,
          sourceVersionAt: new Date("2026-08-02T12:00:00Z"),
          lineListingVariantReference: null,
        }),
      ],
    });

    const [orderRow] = await client.db
      .select({ id: order.id })
      .from(order)
      .where(
        and(
          eq(order.channelId, world.channelId),
          eq(order.reference, reference)
        )
      );
    const [line] = await client.db
      .select({ listingVariantReference: orderLine.listingVariantReference })
      .from(orderLine)
      .where(eq(orderLine.orderId, orderRow?.id ?? ""));
    expect(line?.listingVariantReference).toBeNull();
  });

  it("a successful upsert clears the remote-missing mark", async () => {
    const world = await seedChannelWorld();
    const reference = `ord-${crypto.randomUUID()}`;
    const t1 = new Date("2026-08-01T12:00:00Z");

    await upsertOrders(ctx, {
      channelId: world.channelId,
      orders: [snapshot({ reference, sourceVersionAt: t1 })],
    });
    await client.db
      .update(order)
      .set({ remoteMissingAt: new Date() })
      .where(
        and(
          eq(order.channelId, world.channelId),
          eq(order.reference, reference)
        )
      );

    await upsertOrders(ctx, {
      channelId: world.channelId,
      orders: [snapshot({ reference, sourceVersionAt: t1 })],
    });

    const [row] = await client.db
      .select({ remoteMissingAt: order.remoteMissingAt })
      .from(order)
      .where(
        and(
          eq(order.channelId, world.channelId),
          eq(order.reference, reference)
        )
      );
    expect(row?.remoteMissingAt).toBeNull();
  });

  it("stores unresolved references, then relinks and applies baseline on re-pull", async () => {
    const seedObservedAt = new Date("2026-08-15T00:00:00Z");
    const world = await seedChannelWorld({
      stockQuantity: 10,
      stockSeed: { basis: "listing_available", observedAt: seedObservedAt },
    });
    const reference = `ord-${crypto.randomUUID()}`;
    const lvRef = `lv-${crypto.randomUUID()}`;
    const versionAt = new Date("2026-08-16T00:00:00Z");
    const orderedAt = new Date("2026-08-01T00:00:00Z");

    // Orders arrive before the listing world exists.
    await upsertOrders(ctx, {
      channelId: world.channelId,
      orders: [
        snapshot({
          reference,
          sourceVersionAt: versionAt,
          lineListingVariantReference: lvRef,
          orderedAt,
        }),
      ],
    });

    const [orderRow] = await client.db
      .select({ id: order.id })
      .from(order)
      .where(
        and(
          eq(order.channelId, world.channelId),
          eq(order.reference, reference)
        )
      );
    if (!orderRow) {
      throw new Error("order not found");
    }
    const [lineBefore] = await client.db
      .select()
      .from(orderLine)
      .where(eq(orderLine.orderId, orderRow.id));
    expect(lineBefore?.listingVariantId).toBeNull();
    expect(lineBefore?.productVariantId).toBeNull();
    expect(lineBefore?.listingVariantReference).toBe(lvRef);

    // No inventory effect yet: no state row, stock untouched.
    const counters = await readCounters(lineBefore?.id ?? "");
    expect(Object.keys(counters)).toHaveLength(0);
    const [stockBefore] = await client.db
      .select({
        quantity: stock.quantity,
        reservedQuantity: stock.reservedQuantity,
      })
      .from(stock)
      .where(eq(stock.id, world.stockId));
    expect(stockBefore?.quantity).toBe(10);
    expect(stockBefore?.reservedQuantity).toBe(0);

    // The listing world appears (listings sync ran).
    const [listingRow] = await client.db
      .insert(listing)
      .values({
        organizationId: world.organizationId,
        channelId: world.channelId,
        reference: `item-${crypto.randomUUID()}`,
        title: "Widget",
        type: "FixedPriceItem",
        url: "https://example.com/item",
        condition: "New",
        handlingTime: 1,
        status: "active",
        startedAt: new Date("2026-07-01T00:00:00Z"),
      })
      .returning({ id: listing.id });
    if (!listingRow) {
      throw new Error("listing seed failed");
    }
    await client.db.insert(listingVariant).values({
      organizationId: world.organizationId,
      listingId: listingRow.id,
      productVariantId: world.productVariantId,
      reference: lvRef,
      price: 1999,
      quantity: 3,
      length: 1,
      width: 1,
      height: 1,
      weight: 1,
    });

    // Re-pull the same snapshot: COALESCE fills the ids and the inventory
    // pass applies the baseline rule end-to-end.
    await upsertOrders(ctx, {
      channelId: world.channelId,
      orders: [
        snapshot({
          reference,
          sourceVersionAt: versionAt,
          lineListingVariantReference: lvRef,
          orderedAt,
        }),
      ],
    });

    const [lineAfter] = await client.db
      .select()
      .from(orderLine)
      .where(eq(orderLine.orderId, orderRow.id));
    expect(lineAfter?.productVariantId).toBe(world.productVariantId);
    expect(lineAfter?.listingVariantId).not.toBeNull();

    const countersAfter = await readCounters(lineAfter?.id ?? "");
    expect(countersAfter.reserved).toBe(5);

    const [stockAfter] = await client.db
      .select({
        quantity: stock.quantity,
        reservedQuantity: stock.reservedQuantity,
      })
      .from(stock)
      .where(eq(stock.id, world.stockId));
    expect(stockAfter?.quantity).toBe(15);
    expect(stockAfter?.reservedQuantity).toBe(5);

    const ledger = await client.db
      .select({
        type: stockTransaction.type,
        quantity: stockTransaction.quantity,
      })
      .from(stockTransaction)
      .where(eq(stockTransaction.orderLineId, lineAfter?.id ?? ""));
    expect(
      ledger.some((row) => row.type === "adjust" && row.quantity === 5)
    ).toBe(true);
  });
});
