import { createDbClient } from "@dashseller/db/client";
import {
  channel,
  listing,
  listingVariant,
  marketplace,
  order,
  orderLine,
  organization,
  product,
  productVariant,
} from "@dashseller/db/schema";
import { migrateTestDb, TEST_DATABASE_URL } from "@dashseller/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SyncContext } from "../../context";
import { systemClock } from "../../context";
import { findRelinkableOrders } from "../relink";

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

interface World {
  channelId: string;
  organizationId: string;
  productVariantId: string;
}

async function seedWorld(): Promise<World> {
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
  return { organizationId, channelId, productVariantId: variant.id };
}

async function seedListingVariant(
  world: World,
  params: { productVariantId: string | null; reference: string }
): Promise<void> {
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
    productVariantId: params.productVariantId,
    reference: params.reference,
    price: 1999,
    quantity: 3,
    length: 1,
    width: 1,
    height: 1,
    weight: 1,
  });
}

async function seedOrderWithLine(
  world: World,
  params: {
    lineListingVariantId?: string | null;
    lineListingVariantReference: string | null;
  }
): Promise<string> {
  const reference = `ord-${crypto.randomUUID()}`;
  const [orderRow] = await client.db
    .insert(order)
    .values({
      organizationId: world.organizationId,
      channelId: world.channelId,
      reference,
    })
    .returning({ id: order.id });
  if (!orderRow) {
    throw new Error("order seed failed");
  }
  await client.db.insert(orderLine).values({
    organizationId: world.organizationId,
    orderId: orderRow.id,
    reference: "line-1",
    quantity: 5,
    listingVariantId: params.lineListingVariantId ?? null,
    listingVariantReference: params.lineListingVariantReference,
  });
  return reference;
}

describe("findRelinkableOrders", () => {
  it("returns distinct references for unresolved lines whose variant now exists", async () => {
    const world = await seedWorld();
    const lvRef = `lv-${crypto.randomUUID()}`;
    await seedListingVariant(world, {
      reference: lvRef,
      productVariantId: world.productVariantId,
    });
    const refA = await seedOrderWithLine(world, {
      lineListingVariantReference: lvRef,
    });
    const refB = await seedOrderWithLine(world, {
      lineListingVariantReference: lvRef,
    });

    const found = await findRelinkableOrders(ctx, {
      channelId: world.channelId,
    });
    expect(found.sort()).toEqual([refA, refB].sort());
  });

  it("excludes already-resolved lines", async () => {
    const world = await seedWorld();
    const lvRef = `lv-${crypto.randomUUID()}`;
    await seedListingVariant(world, {
      reference: lvRef,
      productVariantId: world.productVariantId,
    });
    const [variantRow] = await client.db
      .select({ id: listingVariant.id })
      .from(listingVariant)
      .where(eq(listingVariant.reference, lvRef));
    await seedOrderWithLine(world, {
      lineListingVariantReference: lvRef,
      lineListingVariantId: variantRow?.id ?? null,
    });

    const found = await findRelinkableOrders(ctx, {
      channelId: world.channelId,
    });
    expect(found).toEqual([]);
  });

  it("excludes variants without a productVariantId (relink could never land)", async () => {
    const world = await seedWorld();
    const lvRef = `lv-${crypto.randomUUID()}`;
    await seedListingVariant(world, {
      reference: lvRef,
      productVariantId: null,
    });
    await seedOrderWithLine(world, { lineListingVariantReference: lvRef });

    const found = await findRelinkableOrders(ctx, {
      channelId: world.channelId,
    });
    expect(found).toEqual([]);
  });

  it("excludes orders marked remote-missing", async () => {
    const world = await seedWorld();
    const lvRef = `lv-${crypto.randomUUID()}`;
    await seedListingVariant(world, {
      reference: lvRef,
      productVariantId: world.productVariantId,
    });
    const reference = await seedOrderWithLine(world, {
      lineListingVariantReference: lvRef,
    });
    await client.db
      .update(order)
      .set({ remoteMissingAt: new Date() })
      .where(eq(order.reference, reference));

    const found = await findRelinkableOrders(ctx, {
      channelId: world.channelId,
    });
    expect(found).toEqual([]);
  });

  it("excludes lines with no stored reference", async () => {
    const world = await seedWorld();
    await seedOrderWithLine(world, { lineListingVariantReference: null });

    const found = await findRelinkableOrders(ctx, {
      channelId: world.channelId,
    });
    expect(found).toEqual([]);
  });

  it("never crosses channels", async () => {
    const worldA = await seedWorld();
    const worldB = await seedWorld();
    const lvRef = `lv-${crypto.randomUUID()}`;
    // The listing variant exists only on channel B; the order is on A.
    await seedListingVariant(worldB, {
      reference: lvRef,
      productVariantId: worldB.productVariantId,
    });
    await seedOrderWithLine(worldA, { lineListingVariantReference: lvRef });

    expect(
      await findRelinkableOrders(ctx, { channelId: worldA.channelId })
    ).toEqual([]);
    expect(
      await findRelinkableOrders(ctx, { channelId: worldB.channelId })
    ).toEqual([]);
  });

  it("respects the limit", async () => {
    const world = await seedWorld();
    const lvRef = `lv-${crypto.randomUUID()}`;
    await seedListingVariant(world, {
      reference: lvRef,
      productVariantId: world.productVariantId,
    });
    await seedOrderWithLine(world, { lineListingVariantReference: lvRef });
    await seedOrderWithLine(world, { lineListingVariantReference: lvRef });
    await seedOrderWithLine(world, { lineListingVariantReference: lvRef });

    const found = await findRelinkableOrders(ctx, {
      channelId: world.channelId,
      limit: 2,
    });
    expect(found).toHaveLength(2);
  });
});
