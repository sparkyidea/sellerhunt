import { createDbClient } from "@dashseller/db/client";
import {
  channel,
  channelSyncState,
  listing,
  listingVariant,
  marketplace,
  organization,
  stock,
  stockTransaction,
  warehouse,
} from "@dashseller/db/schema";
import { migrateTestDb, TEST_DATABASE_URL } from "@dashseller/db/testing";
import type {
  ApiClient,
  Listing,
  PageResult,
} from "@dashseller/marketplace/types";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SyncContext } from "../../context";
import { systemClock } from "../../context";
import { archiveListing } from "../archive";
import { syncChannelListings } from "../sync-channel-listings";
import { upsertListings } from "../upsert-listings";

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

function listingSnapshot(params: {
  observedAt?: Date | null;
  reference: string;
  sourceVersionAt: Date | null;
  title?: string;
}): Listing {
  return {
    marketplaceCategoryReference: "",
    observedAt: params.observedAt ?? null,
    title: params.title ?? "Widget",
    description: "A widget",
    descriptionHtml: null,
    brand: null,
    manufacturer: null,
    condition: "New",
    conditionNote: null,
    imageUrls: null,
    variant: false,
    reference: params.reference,
    sourceVersionAt: params.sourceVersionAt,
    subTitle: null,
    type: "FixedPriceItem",
    url: "https://example.com/item",
    watchCount: null,
    viewCount: null,
    duration: null,
    status: "active",
    offer: null,
    offerAcceptPrice: null,
    offerDeclinePrice: null,
    domesticReturn: false,
    domesticReturnPaidBy: null,
    domesticReturnWindow: null,
    internationalReturn: false,
    internationalReturnPaidBy: null,
    internationalReturnWindow: null,
    restockingFee: null,
    localPickup: false,
    handlingTime: 1,
    handlingFee: null,
    domesticShipping: false,
    domesticShippingType: null,
    domesticShippingBaseFee: null,
    domesticShippingAdditionalFee: null,
    internationalShipping: false,
    internationalShippingType: null,
    internationalShippingBaseFee: null,
    internationalShippingAdditionalFee: null,
    startedAt: new Date("2026-07-01T00:00:00Z"),
    endedAt: null,
    listingVariants: [
      {
        reference: `${params.reference}-v1`,
        quantity: 3,
        sold: 0,
        sku: null,
        model: null,
        upc: null,
        ean: null,
        isbn: null,
        gtin: null,
        attributes: null,
        price: 1999,
        length: 1,
        width: 1,
        height: 1,
        weight: 1,
        imageUrls: null,
      },
    ],
  };
}

function createListingsClient(pages: Array<Listing[] | Error>): ApiClient {
  let call = 0;
  const unreachable = () => {
    throw new Error("not used in this test");
  };
  return {
    createFulfillment: unreachable,
    getChannel: unreachable,
    getFulfillments: unreachable,
    getOrders: unreachable,
    refresh: unreachable,
    getListings: (): Promise<PageResult<Listing>> => {
      const page = pages[call];
      call += 1;
      if (page === undefined) {
        return Promise.resolve({ data: [], cursor: null });
      }
      if (page instanceof Error) {
        return Promise.reject(page);
      }
      return Promise.resolve({
        data: page,
        cursor: call < pages.length ? `page:${call}` : null,
      });
    },
  };
}

async function seedChannelWorld() {
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
  return { organizationId, channelId };
}

async function seedWarehouse(organizationId: string): Promise<string> {
  const [row] = await client.db
    .insert(warehouse)
    .values({
      organizationId,
      address1: "1 Main St",
      city: "Springfield",
      state: "IL",
      zipcode: "62701",
    })
    .returning({ id: warehouse.id });
  if (!row) {
    throw new Error("warehouse seed failed");
  }
  return row.id;
}

async function readListing(channelId: string, reference: string) {
  const [row] = await client.db
    .select({
      id: listing.id,
      archived: listing.archived,
      archivedAt: listing.archivedAt,
      lastObservedAt: listing.lastObservedAt,
      sourceVersionAt: listing.sourceVersionAt,
      title: listing.title,
    })
    .from(listing)
    .where(
      and(eq(listing.channelId, channelId), eq(listing.reference, reference))
    );
  return row;
}

describe("upsertListings clocks", () => {
  it("stamps lastObservedAt with the database clock on every observation", async () => {
    const world = await seedChannelWorld();
    const reference = `item-${crypto.randomUUID()}`;
    await upsertListings(ctx, {
      channelId: world.channelId,
      observedAt: new Date(),
      observedAtUpper: new Date(),
      listings: [
        listingSnapshot({
          reference,
          sourceVersionAt: new Date("2026-08-01T00:00:00Z"),
        }),
      ],
    });
    const row = await readListing(world.channelId, reference);
    expect(row?.lastObservedAt).not.toBeNull();
    const skewMs = Math.abs((row?.lastObservedAt?.getTime() ?? 0) - Date.now());
    expect(skewMs).toBeLessThan(60_000);
  });
});

describe("tombstones (update-then-delete ordering)", () => {
  it("archives on delete after update, with the tombstone version stored", async () => {
    const world = await seedChannelWorld();
    const reference = `item-${crypto.randomUUID()}`;
    const v1 = new Date("2026-08-01T00:00:00Z");
    const v2 = new Date("2026-08-02T00:00:00Z");

    await upsertListings(ctx, {
      channelId: world.channelId,
      observedAt: new Date(),
      observedAtUpper: new Date(),
      listings: [listingSnapshot({ reference, sourceVersionAt: v1 })],
    });
    const outcome = await archiveListing(ctx, {
      channelId: world.channelId,
      reference,
      tombstoneVersion: v2,
    });
    expect(outcome).toBe("archived");

    const row = await readListing(world.channelId, reference);
    expect(row?.archived).toBe(true);
    expect(row?.archivedAt).not.toBeNull();
    expect(row?.sourceVersionAt).toEqual(v2);
  });

  it("archives with a tombstone only 1 hour newer than the stored clock", async () => {
    // Regression guard for clock-mixing: a raw Date param in the staleness
    // comparison shifts by the host's UTC offset, which misjudges any
    // tombstone within that offset of the stored version.
    const world = await seedChannelWorld();
    const reference = `item-${crypto.randomUUID()}`;
    await upsertListings(ctx, {
      channelId: world.channelId,
      observedAt: new Date(),
      observedAtUpper: new Date(),
      listings: [
        listingSnapshot({
          reference,
          sourceVersionAt: new Date("2026-08-02T00:00:00Z"),
        }),
      ],
    });
    const outcome = await archiveListing(ctx, {
      channelId: world.channelId,
      reference,
      tombstoneVersion: new Date("2026-08-02T01:00:00Z"),
    });
    expect(outcome).toBe("archived");
  });

  it("rejects a stale tombstone that predates the stored clock", async () => {
    const world = await seedChannelWorld();
    const reference = `item-${crypto.randomUUID()}`;
    const v2 = new Date("2026-08-02T00:00:00Z");
    const v1 = new Date("2026-08-01T00:00:00Z");

    await upsertListings(ctx, {
      channelId: world.channelId,
      observedAt: new Date(),
      observedAtUpper: new Date(),
      listings: [listingSnapshot({ reference, sourceVersionAt: v2 })],
    });
    const outcome = await archiveListing(ctx, {
      channelId: world.channelId,
      reference,
      tombstoneVersion: v1,
    });
    expect(outcome).toBe("stale");
    const row = await readListing(world.channelId, reference);
    expect(row?.archived).toBe(false);
  });

  it("an older update cannot un-archive; a newer one can", async () => {
    const world = await seedChannelWorld();
    const reference = `item-${crypto.randomUUID()}`;
    const v1 = new Date("2026-08-01T00:00:00Z");
    const v2 = new Date("2026-08-02T00:00:00Z");
    const v3 = new Date("2026-08-03T00:00:00Z");

    await upsertListings(ctx, {
      channelId: world.channelId,
      observedAt: new Date(),
      observedAtUpper: new Date(),
      listings: [listingSnapshot({ reference, sourceVersionAt: v1 })],
    });
    await archiveListing(ctx, {
      channelId: world.channelId,
      reference,
      tombstoneVersion: v2,
    });

    const staleResult = await upsertListings(ctx, {
      channelId: world.channelId,
      observedAt: new Date(),
      observedAtUpper: new Date(),
      listings: [
        listingSnapshot({ reference, sourceVersionAt: v1, title: "Old" }),
      ],
    });
    expect(staleResult.staleRejected).toBe(1);
    let row = await readListing(world.channelId, reference);
    expect(row?.archived).toBe(true);
    expect(row?.title).not.toBe("Old");

    await upsertListings(ctx, {
      channelId: world.channelId,
      observedAt: new Date(),
      observedAtUpper: new Date(),
      listings: [
        listingSnapshot({ reference, sourceVersionAt: v3, title: "Restored" }),
      ],
    });
    row = await readListing(world.channelId, reference);
    expect(row?.archived).toBe(false);
    expect(row?.archivedAt).toBeNull();
    expect(row?.title).toBe("Restored");
  });
});

describe("full reconciliation", () => {
  it("recovers a missed delete: archives unseen rows after all pages", async () => {
    const world = await seedChannelWorld();
    const seenRef = `item-${crypto.randomUUID()}`;
    const missedRef = `item-${crypto.randomUUID()}`;
    const v1 = new Date("2026-08-01T00:00:00Z");
    const v2 = new Date("2026-08-02T00:00:00Z");

    // Both listings exist locally from an earlier observation.
    await upsertListings(ctx, {
      channelId: world.channelId,
      observedAt: new Date(),
      observedAtUpper: new Date(),
      listings: [
        listingSnapshot({ reference: seenRef, sourceVersionAt: v1 }),
        listingSnapshot({ reference: missedRef, sourceVersionAt: v1 }),
      ],
    });

    // Full recon: the marketplace now returns only one of them.
    const result = await syncChannelListings(ctx, {
      channelId: world.channelId,
      apiClient: createListingsClient([
        [listingSnapshot({ reference: seenRef, sourceVersionAt: v2 })],
      ]),
      forceRefresh: true,
    });
    expect(result.success).toBe(true);
    expect(result.archived).toBe(1);

    const seen = await readListing(world.channelId, seenRef);
    const missed = await readListing(world.channelId, missedRef);
    expect(seen?.archived).toBe(false);
    expect(missed?.archived).toBe(true);
    // eBay observation clock: the tombstone carries the newest observation
    // version from the run, so an update from before the recon can't
    // un-archive it.
    expect(missed?.sourceVersionAt).toEqual(v2);

    const stale = await upsertListings(ctx, {
      channelId: world.channelId,
      observedAt: new Date(),
      observedAtUpper: new Date(),
      listings: [
        listingSnapshot({ reference: missedRef, sourceVersionAt: v1 }),
      ],
    });
    expect(stale.staleRejected).toBe(1);
    expect((await readListing(world.channelId, missedRef))?.archived).toBe(
      true
    );
  });

  it("archives nothing when a page fails, and holds the watermark", async () => {
    const world = await seedChannelWorld();
    const aRef = `item-${crypto.randomUUID()}`;
    const bRef = `item-${crypto.randomUUID()}`;
    const v1 = new Date("2026-08-01T00:00:00Z");

    await upsertListings(ctx, {
      channelId: world.channelId,
      observedAt: new Date(),
      observedAtUpper: new Date(),
      listings: [
        listingSnapshot({ reference: aRef, sourceVersionAt: v1 }),
        listingSnapshot({ reference: bRef, sourceVersionAt: v1 }),
      ],
    });

    const result = await syncChannelListings(ctx, {
      channelId: world.channelId,
      apiClient: createListingsClient([
        [listingSnapshot({ reference: aRef, sourceVersionAt: v1 })],
        new Error("page 2 timed out"),
      ]),
      forceRefresh: true,
    });
    expect(result.success).toBe(false);
    expect(result.archived).toBe(0);
    expect((await readListing(world.channelId, bRef))?.archived).toBe(false);

    const [state] = await client.db
      .select()
      .from(channelSyncState)
      .where(
        and(
          eq(channelSyncState.channelId, world.channelId),
          eq(channelSyncState.domain, "listings")
        )
      );
    expect(state?.status).toBe("error");
    expect(state?.syncedAt).toBeNull();
  });

  it("never archives rows sync has not observed (null lastObservedAt)", async () => {
    const world = await seedChannelWorld();
    const localRef = `item-${crypto.randomUUID()}`;
    // A row created outside sync — e.g. by the UI — with no observation.
    await client.db.insert(listing).values({
      organizationId: world.organizationId,
      channelId: world.channelId,
      reference: localRef,
      title: "Local only",
      type: "FixedPriceItem",
      url: "https://example.com",
      condition: "New",
      handlingTime: 1,
      status: "active",
      startedAt: new Date(),
    });

    const result = await syncChannelListings(ctx, {
      channelId: world.channelId,
      apiClient: createListingsClient([]),
      forceRefresh: true,
    });
    expect(result.success).toBe(true);
    expect((await readListing(world.channelId, localRef))?.archived).toBe(
      false
    );
  });

  it("archives a backfilled row (lastObservedAt set by the migration backfill)", async () => {
    const world = await seedChannelWorld();
    const backfilledRef = `item-${crypto.randomUUID()}`;
    // Pre-migration row whose lastObservedAt came from the COALESCE backfill.
    await client.db.insert(listing).values({
      organizationId: world.organizationId,
      channelId: world.channelId,
      reference: backfilledRef,
      title: "Backfilled",
      type: "FixedPriceItem",
      url: "https://example.com",
      condition: "New",
      handlingTime: 1,
      status: "active",
      startedAt: new Date("2026-01-01T00:00:00Z"),
      lastObservedAt: new Date("2026-06-01T00:00:00Z"),
    });

    const result = await syncChannelListings(ctx, {
      channelId: world.channelId,
      apiClient: createListingsClient([]),
      forceRefresh: true,
    });
    expect(result.success).toBe(true);
    expect(result.archived).toBe(1);
    expect((await readListing(world.channelId, backfilledRef))?.archived).toBe(
      true
    );
  });

  it("does not archive on incremental runs", async () => {
    const world = await seedChannelWorld();
    const unseenRef = `item-${crypto.randomUUID()}`;
    const v1 = new Date("2026-08-01T00:00:00Z");
    await upsertListings(ctx, {
      channelId: world.channelId,
      observedAt: new Date(),
      observedAtUpper: new Date(),
      listings: [
        listingSnapshot({ reference: unseenRef, sourceVersionAt: v1 }),
      ],
    });
    // Seed a listings watermark so the run is incremental.
    await client.db.insert(channelSyncState).values({
      organizationId: world.organizationId,
      channelId: world.channelId,
      domain: "listings",
      syncedAt: new Date("2026-08-10T00:00:00Z"),
    });

    const result = await syncChannelListings(ctx, {
      channelId: world.channelId,
      apiClient: createListingsClient([]),
    });
    expect(result.success).toBe(true);
    expect(result.archived).toBe(0);
    expect((await readListing(world.channelId, unseenRef))?.archived).toBe(
      false
    );
  });
});

describe("initializeStock (seed provenance)", () => {
  const observed = new Date("2026-08-05T10:30:00.000Z");
  const observedUpper = new Date("2026-08-05T10:31:00.000Z");
  const v1 = new Date("2026-08-01T00:00:00Z");

  async function findSeededStock(channelId: string, reference: string) {
    const [variantRow] = await client.db
      .select({ productVariantId: listingVariant.productVariantId })
      .from(listingVariant)
      .innerJoin(listing, eq(listingVariant.listingId, listing.id))
      .where(
        and(
          eq(listing.channelId, channelId),
          eq(listingVariant.reference, `${reference}-v1`)
        )
      );
    if (!variantRow?.productVariantId) {
      return null;
    }
    const [stockRow] = await client.db
      .select()
      .from(stock)
      .where(eq(stock.productVariantId, variantRow.productVariantId));
    return stockRow ?? null;
  }

  it("seeds new stock with quantity, provenance, and a receive ledger row", async () => {
    const world = await seedChannelWorld();
    await seedWarehouse(world.organizationId);
    const reference = `item-${crypto.randomUUID()}`;
    await upsertListings(ctx, {
      channelId: world.channelId,
      observedAt: observed,
      observedAtUpper: observedUpper,
      listings: [listingSnapshot({ reference, sourceVersionAt: v1 })],
    });

    const stockRow = await findSeededStock(world.channelId, reference);
    expect(stockRow?.quantity).toBe(3);
    expect(stockRow?.seedBasis).toBe("listing_available");
    // SQL-side comparison: timestamp columns round-trip into JS shifted by
    // the host UTC offset, so JS Date equality would be host-dependent.
    const match = await client.db.execute<{ matches: boolean; upper: boolean }>(
      sql`SELECT seed_observed_at = ${observed.toISOString()}::timestamp AS matches,
                 seed_observed_upper_at = ${observedUpper.toISOString()}::timestamp AS upper
          FROM stock WHERE id = ${stockRow?.id ?? ""}`
    );
    expect(match.rows[0]?.matches).toBe(true);
    expect(match.rows[0]?.upper).toBe(true);

    const ledger = await client.db
      .select()
      .from(stockTransaction)
      .where(eq(stockTransaction.stockId, stockRow?.id ?? ""));
    expect(ledger).toHaveLength(1);
    expect(ledger[0]?.type).toBe("receive");
    expect(ledger[0]?.quantity).toBe(3);
  });

  it("prefers the listing's own provider observation clock over the fallback", async () => {
    const world = await seedChannelWorld();
    await seedWarehouse(world.organizationId);
    const reference = `item-${crypto.randomUUID()}`;
    const providerObserved = new Date("2026-08-05T10:15:00.000Z");
    await upsertListings(ctx, {
      channelId: world.channelId,
      observedAt: observed,
      observedAtUpper: observedUpper,
      listings: [
        listingSnapshot({
          reference,
          sourceVersionAt: v1,
          observedAt: providerObserved,
        }),
      ],
    });

    const stockRow = await findSeededStock(world.channelId, reference);
    // A provider clock is exact: both bounds collapse onto it.
    const match = await client.db.execute<{ matches: boolean; upper: boolean }>(
      sql`SELECT seed_observed_at = ${providerObserved.toISOString()}::timestamp AS matches,
                 seed_observed_upper_at = ${providerObserved.toISOString()}::timestamp AS upper
          FROM stock WHERE id = ${stockRow?.id ?? ""}`
    );
    expect(match.rows[0]?.matches).toBe(true);
    expect(match.rows[0]?.upper).toBe(true);
  });

  it("re-sync never re-seeds or overwrites an existing quantity", async () => {
    const world = await seedChannelWorld();
    await seedWarehouse(world.organizationId);
    const reference = `item-${crypto.randomUUID()}`;
    await upsertListings(ctx, {
      channelId: world.channelId,
      observedAt: observed,
      observedAtUpper: observedUpper,
      listings: [listingSnapshot({ reference, sourceVersionAt: v1 })],
    });

    const laterObserved = new Date("2026-08-06T10:30:00.000Z");
    await upsertListings(ctx, {
      channelId: world.channelId,
      observedAt: laterObserved,
      observedAtUpper: laterObserved,
      listings: [
        listingSnapshot({
          reference,
          sourceVersionAt: new Date("2026-08-02T00:00:00Z"),
        }),
      ],
    });

    const stockRow = await findSeededStock(world.channelId, reference);
    expect(stockRow?.quantity).toBe(3);
    const match = await client.db.execute<{ matches: boolean }>(
      sql`SELECT seed_observed_at = ${observed.toISOString()}::timestamp AS matches FROM stock WHERE id = ${stockRow?.id ?? ""}`
    );
    expect(match.rows[0]?.matches).toBe(true);

    const ledger = await client.db
      .select()
      .from(stockTransaction)
      .where(eq(stockTransaction.stockId, stockRow?.id ?? ""));
    expect(ledger).toHaveLength(1);
  });

  it("rejects a duplicate (variant, warehouse) stock row at the database", async () => {
    const world = await seedChannelWorld();
    const warehouseId = await seedWarehouse(world.organizationId);
    const reference = `item-${crypto.randomUUID()}`;
    await upsertListings(ctx, {
      channelId: world.channelId,
      observedAt: observed,
      observedAtUpper: observedUpper,
      listings: [listingSnapshot({ reference, sourceVersionAt: v1 })],
    });
    const stockRow = await findSeededStock(world.channelId, reference);
    expect(stockRow).not.toBeNull();

    // Drizzle wraps the pg error; the unique violation is the cause.
    let caught: unknown = null;
    try {
      await client.db.insert(stock).values({
        organizationId: world.organizationId,
        warehouseId,
        productVariantId: stockRow?.productVariantId ?? "",
        quantity: 5,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    const cause = caught instanceof Error ? caught.cause : null;
    expect(cause instanceof Error ? cause.message : "").toContain(
      "stock_product_variant_warehouse_unique"
    );
  });

  it("returns early without a warehouse: listing lands, no stock rows", async () => {
    const world = await seedChannelWorld();
    const reference = `item-${crypto.randomUUID()}`;
    const result = await upsertListings(ctx, {
      channelId: world.channelId,
      observedAt: observed,
      observedAtUpper: observedUpper,
      listings: [listingSnapshot({ reference, sourceVersionAt: v1 })],
    });
    expect(result.errors).toEqual([]);
    expect(result.newListings).toBe(1);

    const stockRow = await findSeededStock(world.channelId, reference);
    expect(stockRow).toBeNull();
  });
});
