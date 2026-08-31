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
import {
  migrateTestDb,
  TEST_DATABASE_URL,
  TEST_REDIS_URL,
} from "@dashseller/db/testing";
import {
  createJobClient,
  JOBS,
  type JobClient,
  QUEUES,
} from "@dashseller/job-client";
import type {
  ApiClient,
  Listing,
  Order,
  PageResult,
} from "@dashseller/marketplace/types";
import type { SyncContext } from "@dashseller/sync";
import { systemClock, upsertOrders } from "@dashseller/sync";
import { UnrecoverableError, Worker } from "bullmq";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { registerProcessors } from "../processors";
import { Registry } from "../registry";

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

function testJobClient(): { jobs: JobClient; prefix: string } {
  const prefix = `t${crypto.randomUUID().slice(0, 8)}`;
  const jobs = createJobClient(TEST_REDIS_URL, { prefix });
  cleanups.push(() => jobs.close());
  return { jobs, prefix };
}

function startWorker(params: {
  prefix: string;
  queue: (typeof QUEUES)[keyof typeof QUEUES];
  registry: Registry;
  workerOptions?: Partial<ConstructorParameters<typeof Worker>[2]>;
}): Worker {
  const worker = new Worker(
    params.queue,
    params.registry.processor(params.queue),
    {
      connection: { url: TEST_REDIS_URL, maxRetriesPerRequest: null },
      prefix: params.prefix,
      concurrency: 5,
      ...params.workerOptions,
    }
  );
  cleanups.push(() => worker.close(true));
  return worker;
}

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 20_000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("waitFor timed out");
}

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

function orderSnapshot(
  reference: string,
  quantity = 5,
  options?: { listingVariantReference?: string | null }
): Order {
  return {
    reference,
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
    orderedAt: new Date("2026-08-01T00:00:00Z"),
    status: "unfulfilled",
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
    customerNote: null,
    sellerNote: null,
    cancelState: null,
    cancellationReason: null,
    sourceVersionAt: new Date("2026-08-02T00:00:00Z"),
    orderLines: [
      {
        reference: "line-1",
        title: "Widget",
        quantity,
        activeQuantity: quantity,
        sku: null,
        unitPrice: null,
        discount: null,
        tax: null,
        total: null,
        listingVariantReference: options?.listingVariantReference ?? null,
      },
    ],
  };
}

function listingSnapshot(params: {
  reference: string;
  variantQuantity?: number;
  variantReference: string;
}): Listing {
  return {
    marketplaceCategoryReference: "",
    observedAt: null,
    title: "Widget",
    description: "A widget",
    descriptionHtml: null,
    brand: null,
    manufacturer: null,
    condition: "New",
    conditionNote: null,
    imageUrls: null,
    variant: false,
    reference: params.reference,
    sourceVersionAt: new Date("2026-08-02T00:00:00Z"),
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
        reference: params.variantReference,
        quantity: params.variantQuantity ?? 10,
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

function stubApiClient(overrides: Partial<ApiClient> = {}): ApiClient {
  const unreachable = () => {
    throw new Error("not stubbed");
  };
  return {
    createFulfillment: unreachable,
    getChannel: unreachable,
    getFulfillments: () => Promise.resolve([]),
    getListings: (): Promise<PageResult<never>> =>
      Promise.resolve({ data: [], cursor: null }),
    getOrders: (): Promise<PageResult<Order>> =>
      Promise.resolve({ data: [], cursor: null }),
    refresh: unreachable,
    ...overrides,
  };
}

async function seedChannelWorld(options?: { catalog?: boolean }) {
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
    throw new Error("seed failed");
  }
  if (options?.catalog === false) {
    return { organizationId, channelId, productVariantId: null };
  }
  const [prod] = await db
    .insert(product)
    .values({ organizationId, title: "Widget", condition: "New" })
    .returning({ id: product.id });
  if (!prod) {
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
  await db.insert(stock).values({
    organizationId,
    warehouseId: wh.id,
    productVariantId: variant.id,
    quantity: 100,
  });
  return { organizationId, channelId, productVariantId: variant.id };
}

/** Pretend a listings run already succeeded so the orders gate opens. */
async function seedListingsWatermark(world: {
  channelId: string;
  organizationId: string;
}): Promise<void> {
  await client.db.insert(channelSyncState).values({
    organizationId: world.organizationId,
    channelId: world.channelId,
    domain: "listings",
    status: "success",
    syncedAt: new Date("2026-08-10T00:00:00Z"),
  });
}

async function readOrdersSyncState(channelId: string) {
  const [row] = await client.db
    .select()
    .from(channelSyncState)
    .where(
      and(
        eq(channelSyncState.channelId, channelId),
        eq(channelSyncState.domain, "orders")
      )
    );
  return row ?? null;
}

describe("delivery job identity", () => {
  it("removes failed delivery jobs immediately so redelivery works; a legacy failed job suppresses it", async () => {
    const { jobs, prefix } = testJobClient();
    const registry = new Registry(ctx.logger);
    let processed = 0;
    let failures = 0;
    let failNext = true;
    registry.register(QUEUES.syncOrders, JOBS.syncOrder, () => {
      if (failNext) {
        failNext = false;
        failures += 1;
        // Straight to failed — no retries — mirroring a permanent handler bug.
        throw new UnrecoverableError("boom");
      }
      processed += 1;
      return Promise.resolve({ ok: true });
    });
    startWorker({ prefix, queue: QUEUES.syncOrders, registry });

    const payload = { channelId: "ch-x", orderReference: "ord-1" };
    const delivery = { marketplace: "ebay", deliveryId: "delivery-abc" };

    // First delivery fails; removeOnFail: true must erase the job id.
    await jobs.enqueueSyncOrder(payload, delivery);
    await waitFor(() => failures === 1);
    await waitFor(async () => {
      const counts = await jobs
        .queue(QUEUES.syncOrders)
        .getJobCounts("failed", "active", "waiting", "delayed");
      return (
        counts.failed === 0 &&
        counts.active === 0 &&
        counts.waiting === 0 &&
        counts.delayed === 0
      );
    });

    // Outwait the fetch-latest coalescing window (3s) — a redelivery inside
    // it coalesces away by design; marketplaces redeliver over hours.
    await new Promise((resolve) => setTimeout(resolve, 3200));

    // Marketplace redelivers the SAME delivery id — must process now.
    await jobs.enqueueSyncOrder(payload, delivery);
    await waitFor(() => processed === 1);
    expect(processed).toBe(1);

    // Legacy failed job (age-based retention, pre-cutover): same id sits in
    // failed and SUPPRESSES the redelivery — this is why the cutover
    // runbook runs queue.clean before flipping traffic.
    failNext = true;
    await jobs.queue(QUEUES.syncOrders).add(JOBS.syncOrder, payload, {
      jobId: "ebay-legacyjobid000000000000000000",
      removeOnFail: { age: 7 * 24 * 3600 },
      attempts: 1,
    });
    await waitFor(async () => {
      const counts = await jobs.queue(QUEUES.syncOrders).getJobCounts("failed");
      return counts.failed === 1;
    });
    const before = processed;
    await jobs.queue(QUEUES.syncOrders).add(JOBS.syncOrder, payload, {
      jobId: "ebay-legacyjobid000000000000000000",
    });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(processed).toBe(before);
  });
});

describe("processor integrity under concurrency", () => {
  it("nets concurrent identical sync-order jobs to one inventory effect", async () => {
    const world = await seedChannelWorld();
    await seedListingsWatermark(world);
    const reference = `ord-${crypto.randomUUID()}`;

    // Materialize the order + line, then attach the variant so the
    // inventory pass engages (line resolution needs a listing mapping the
    // sync deliberately does not seed here).
    await upsertOrders(ctx, {
      channelId: world.channelId,
      orders: [orderSnapshot(reference)],
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
      throw new Error("order missing");
    }
    await client.db
      .update(orderLine)
      .set({ productVariantId: world.productVariantId })
      .where(eq(orderLine.orderId, orderRow.id));

    const { jobs, prefix } = testJobClient();
    const registry = new Registry(ctx.logger);
    registerProcessors({
      ctx,
      jobs,
      registry,
      config: {
        webhookBaseUrl: "http://localhost:8788",
        ebayVerificationToken: "test-token",
      },
      apiClientFactory: () =>
        Promise.resolve(
          stubApiClient({
            getOrder: () => Promise.resolve(orderSnapshot(reference)),
          })
        ),
    });
    startWorker({ prefix, queue: QUEUES.syncOrders, registry });

    // Four distinct deliveries for the same order, racing at concurrency 5.
    await Promise.all(
      [1, 2, 3, 4].map((n) =>
        jobs.enqueueSyncOrder(
          { channelId: world.channelId, orderReference: reference },
          { marketplace: "ebay", deliveryId: `d-${reference}-${n}` }
        )
      )
    );
    await waitFor(async () => {
      const counts = await jobs
        .queue(QUEUES.syncOrders)
        .getJobCounts("completed");
      return (counts.completed ?? 0) >= 1;
    });
    await waitFor(async () => {
      const counts = await jobs
        .queue(QUEUES.syncOrders)
        .getJobCounts("active", "waiting", "delayed");
      return (
        counts.active === 0 && counts.waiting === 0 && counts.delayed === 0
      );
    });

    const [line] = await client.db
      .select({ id: orderLine.id })
      .from(orderLine)
      .where(eq(orderLine.orderId, orderRow.id));
    const [state] = await client.db
      .select({ reserved: orderLineInventoryState.appliedReservedQuantity })
      .from(orderLineInventoryState)
      .where(eq(orderLineInventoryState.orderLineId, line?.id ?? ""));
    expect(state?.reserved).toBe(5);

    if (!world.productVariantId) {
      throw new Error("catalog missing");
    }
    const [stockRow] = await client.db
      .select({ reservedQuantity: stock.reservedQuantity })
      .from(stock)
      .where(eq(stock.productVariantId, world.productVariantId));
    expect(stockRow?.reservedQuantity).toBe(5);
  });
});

describe("listings-first gate and chain", () => {
  function registerWithStub(params: {
    apiClient: ApiClient;
    jobs: JobClient;
    registry: Registry;
  }): void {
    registerProcessors({
      ctx,
      jobs: params.jobs,
      registry: params.registry,
      config: {
        webhookBaseUrl: "http://localhost:8788",
        ebayVerificationToken: "test-token",
      },
      apiClientFactory: () => Promise.resolve(params.apiClient),
    });
  }

  it("gates channel-orders while the listings watermark is null", async () => {
    const world = await seedChannelWorld();
    let getOrdersCalls = 0;
    const { jobs, prefix } = testJobClient();
    const registry = new Registry(ctx.logger);
    registerWithStub({
      jobs,
      registry,
      apiClient: stubApiClient({
        getOrders: (): Promise<PageResult<Order>> => {
          getOrdersCalls += 1;
          return Promise.resolve({ data: [], cursor: null });
        },
      }),
    });
    startWorker({ prefix, queue: QUEUES.syncOrders, registry });

    await jobs.enqueueSyncChannelOrders({
      channelId: world.channelId,
      forceRefresh: false,
    });
    await waitFor(async () => {
      const counts = await jobs
        .queue(QUEUES.syncOrders)
        .getJobCounts("completed");
      return (counts.completed ?? 0) >= 1;
    });

    expect(getOrdersCalls).toBe(0);
    expect(await readOrdersSyncState(world.channelId)).toBeNull();
  });

  it("gates sync-order without spending a getOrder call", async () => {
    const world = await seedChannelWorld();
    let getOrderCalls = 0;
    const { jobs, prefix } = testJobClient();
    const registry = new Registry(ctx.logger);
    registerWithStub({
      jobs,
      registry,
      apiClient: stubApiClient({
        getOrder: (): Promise<Order | null> => {
          getOrderCalls += 1;
          return Promise.resolve(null);
        },
      }),
    });
    startWorker({ prefix, queue: QUEUES.syncOrders, registry });

    await jobs.enqueueSyncOrder(
      { channelId: world.channelId, orderReference: "ord-gated" },
      { marketplace: "ebay", deliveryId: `d-${crypto.randomUUID()}` }
    );
    await waitFor(async () => {
      const counts = await jobs
        .queue(QUEUES.syncOrders)
        .getJobCounts("completed");
      return (counts.completed ?? 0) >= 1;
    });

    expect(getOrderCalls).toBe(0);
    expect(await readOrdersSyncState(world.channelId)).toBeNull();
  });

  it("stamps remote-missing on not-found so relink stops re-enqueueing", async () => {
    const world = await seedChannelWorld();
    await seedListingsWatermark(world);
    const reference = `ord-${crypto.randomUUID()}`;
    await upsertOrders(ctx, {
      channelId: world.channelId,
      orders: [orderSnapshot(reference)],
    });

    const { jobs, prefix } = testJobClient();
    const registry = new Registry(ctx.logger);
    registerWithStub({
      jobs,
      registry,
      apiClient: stubApiClient({
        getOrder: (): Promise<Order | null> => Promise.resolve(null),
      }),
    });
    startWorker({ prefix, queue: QUEUES.syncOrders, registry });

    await jobs.enqueueSyncOrder(
      { channelId: world.channelId, orderReference: reference },
      { marketplace: "ebay", deliveryId: `d-${crypto.randomUUID()}` }
    );
    await waitFor(async () => {
      const [row] = await client.db
        .select({ remoteMissingAt: order.remoteMissingAt })
        .from(order)
        .where(
          and(
            eq(order.channelId, world.channelId),
            eq(order.reference, reference)
          )
        );
      return row?.remoteMissingAt != null;
    });
  });

  it("chains the first orders pull after a successful listings run", async () => {
    const world = await seedChannelWorld();
    const { jobs, prefix } = testJobClient();
    const registry = new Registry(ctx.logger);
    registerWithStub({ jobs, registry, apiClient: stubApiClient() });
    startWorker({ prefix, queue: QUEUES.syncListings, registry });
    startWorker({ prefix, queue: QUEUES.syncOrders, registry });

    await jobs.enqueueSyncChannelListings({
      channelId: world.channelId,
      forceRefresh: false,
    });

    await waitFor(async () => {
      const row = await readOrdersSyncState(world.channelId);
      return row?.status === "success";
    });
  });

  it("a chained enqueue is never swallowed by a queued plain orders job", async () => {
    const { jobs } = testJobClient();
    const channelId = `ch-${crypto.randomUUID()}`;

    // Two plain enqueues collapse onto the "orders" dedup id...
    await jobs.enqueueSyncChannelOrders({ channelId, forceRefresh: false });
    await jobs.enqueueSyncChannelOrders({ channelId, forceRefresh: false });
    let counts = await jobs
      .queue(QUEUES.syncOrders)
      .getJobCounts("waiting", "delayed");
    expect((counts.waiting ?? 0) + (counts.delayed ?? 0)).toBe(1);

    // ...but the chained enqueue carries its own id and must always land —
    // a plain job holding the dedup id (queued here; active-and-gated in
    // the real race) can never swallow the chained first pull.
    await jobs.enqueueSyncChannelOrders(
      { channelId, forceRefresh: false },
      { chained: true }
    );
    counts = await jobs
      .queue(QUEUES.syncOrders)
      .getJobCounts("waiting", "delayed");
    expect((counts.waiting ?? 0) + (counts.delayed ?? 0)).toBe(2);
  });

  it("does not chain orders when the orders watermark already exists", async () => {
    const world = await seedChannelWorld();
    await seedListingsWatermark(world);
    await client.db.insert(channelSyncState).values({
      organizationId: world.organizationId,
      channelId: world.channelId,
      domain: "orders",
      status: "success",
      syncedAt: new Date("2026-08-10T00:00:00Z"),
    });

    const { jobs, prefix } = testJobClient();
    const registry = new Registry(ctx.logger);
    registerWithStub({ jobs, registry, apiClient: stubApiClient() });
    startWorker({ prefix, queue: QUEUES.syncListings, registry });

    await jobs.enqueueSyncChannelListings({
      channelId: world.channelId,
      forceRefresh: false,
    });
    await waitFor(async () => {
      const counts = await jobs
        .queue(QUEUES.syncListings)
        .getJobCounts("completed");
      return (counts.completed ?? 0) >= 1;
    });

    const counts = await jobs
      .queue(QUEUES.syncOrders)
      .getJobCounts("waiting", "delayed", "active", "completed");
    expect(
      (counts.waiting ?? 0) +
        (counts.delayed ?? 0) +
        (counts.active ?? 0) +
        (counts.completed ?? 0)
    ).toBe(0);
  });

  it("runs the full repair loop: unresolved line, listings run, relink, baseline", async () => {
    const world = await seedChannelWorld({ catalog: false });
    const orderReference = `ord-${crypto.randomUUID()}`;
    const listingReference = `item-${crypto.randomUUID()}`;
    const variantReference = `lv-${crypto.randomUUID()}`;

    // The order landed before any listings existed (unresolved line with a
    // stored reference; ordered 2026-08-01, before the seed observation).
    await upsertOrders(ctx, {
      channelId: world.channelId,
      orders: [
        orderSnapshot(orderReference, 5, {
          listingVariantReference: variantReference,
        }),
      ],
    });
    const [orderRow] = await client.db
      .select({ id: order.id })
      .from(order)
      .where(
        and(
          eq(order.channelId, world.channelId),
          eq(order.reference, orderReference)
        )
      );
    if (!orderRow) {
      throw new Error("order missing");
    }
    const [lineBefore] = await client.db
      .select({
        id: orderLine.id,
        productVariantId: orderLine.productVariantId,
      })
      .from(orderLine)
      .where(eq(orderLine.orderId, orderRow.id));
    expect(lineBefore?.productVariantId).toBeNull();

    const { jobs, prefix } = testJobClient();
    const registry = new Registry(ctx.logger);
    registerWithStub({
      jobs,
      registry,
      apiClient: stubApiClient({
        getListings: (): Promise<PageResult<Listing>> =>
          Promise.resolve({
            data: [
              listingSnapshot({
                reference: listingReference,
                variantReference,
                variantQuantity: 10,
              }),
            ],
            cursor: null,
          }),
        getOrder: (): Promise<Order | null> =>
          Promise.resolve(
            orderSnapshot(orderReference, 5, {
              listingVariantReference: variantReference,
            })
          ),
      }),
    });
    startWorker({ prefix, queue: QUEUES.syncListings, registry });
    startWorker({ prefix, queue: QUEUES.syncOrders, registry });

    await jobs.enqueueSyncChannelListings({
      channelId: world.channelId,
      forceRefresh: false,
    });

    // Listings run seeds stock (quantity 10, provenance stamped), chains
    // orders, and enqueues the relink sync-order; the relink links the
    // line and applies the baseline rule (order predates the seed).
    await waitFor(async () => {
      const [lineAfter] = await client.db
        .select({ productVariantId: orderLine.productVariantId })
        .from(orderLine)
        .where(eq(orderLine.id, lineBefore?.id ?? ""));
      return Boolean(lineAfter?.productVariantId);
    });
    await waitFor(async () => {
      const [state] = await client.db
        .select({ reserved: orderLineInventoryState.appliedReservedQuantity })
        .from(orderLineInventoryState)
        .where(eq(orderLineInventoryState.orderLineId, lineBefore?.id ?? ""));
      return state?.reserved === 5;
    });

    const [lineAfter] = await client.db
      .select({ productVariantId: orderLine.productVariantId })
      .from(orderLine)
      .where(eq(orderLine.id, lineBefore?.id ?? ""));
    if (!lineAfter?.productVariantId) {
      throw new Error("line not linked");
    }
    const [stockRow] = await client.db
      .select({
        quantity: stock.quantity,
        reservedQuantity: stock.reservedQuantity,
        seedBasis: stock.seedBasis,
      })
      .from(stock)
      .where(eq(stock.productVariantId, lineAfter.productVariantId));
    expect(stockRow?.seedBasis).toBe("listing_available");
    expect(stockRow?.quantity).toBe(15);
    expect(stockRow?.reservedQuantity).toBe(5);

    const ledger = await client.db
      .select({
        type: stockTransaction.type,
        quantity: stockTransaction.quantity,
      })
      .from(stockTransaction)
      .where(eq(stockTransaction.orderLineId, lineBefore?.id ?? ""));
    expect(
      ledger.some((row) => row.type === "adjust" && row.quantity === 5)
    ).toBe(true);
  });
});

describe("stall retry", () => {
  it("redelivers a stalled job to a healthy worker", async () => {
    const { jobs, prefix } = testJobClient();

    // Worker A hangs forever and is force-closed mid-job: its lock expires
    // and the job stalls.
    const hangRegistry = new Registry(ctx.logger);
    let pickedUp = false;
    hangRegistry.register(QUEUES.syncListings, JOBS.syncChannelListings, () => {
      pickedUp = true;
      return new Promise(() => undefined);
    });
    const hangingWorker = new Worker(
      QUEUES.syncListings,
      hangRegistry.processor(QUEUES.syncListings),
      {
        connection: { url: TEST_REDIS_URL, maxRetriesPerRequest: null },
        prefix,
        lockDuration: 1000,
        lockRenewTime: 60_000, // never renews — guarantees the stall
        stalledInterval: 500,
      }
    );

    await jobs.enqueueSyncChannelListings({
      channelId: "ch-stall",
      forceRefresh: false,
    });
    await waitFor(() => pickedUp);
    await hangingWorker.close(true);

    // Worker B is healthy; the stalled checker hands it the job.
    const registry = new Registry(ctx.logger);
    let completed = 0;
    registry.register(QUEUES.syncListings, JOBS.syncChannelListings, () => {
      completed += 1;
      return Promise.resolve({ ok: true });
    });
    startWorker({
      prefix,
      queue: QUEUES.syncListings,
      registry,
      workerOptions: { stalledInterval: 500, lockDuration: 5000 },
    });

    await waitFor(() => completed === 1, 30_000);
    expect(completed).toBe(1);
  });
});

describe("update vs delete non-coalescing", () => {
  it("archive jobs are never swallowed by listings coalescing", async () => {
    const { jobs, prefix } = testJobClient();
    const registry = new Registry(ctx.logger);
    let listingsRuns = 0;
    let archiveRuns = 0;
    registry.register(QUEUES.syncListings, JOBS.syncChannelListings, () => {
      listingsRuns += 1;
      return Promise.resolve({ ok: true });
    });
    registry.register(QUEUES.syncListings, JOBS.archiveListing, () => {
      archiveRuns += 1;
      return Promise.resolve({ ok: true });
    });

    const channelId = "ch-coalesce";
    // Two listing pulls inside the dedup TTL — the second coalesces away.
    await jobs.enqueueSyncChannelListings({ channelId, forceRefresh: false });
    await jobs.enqueueSyncChannelListings({ channelId, forceRefresh: false });
    // The archive for the same channel must NOT coalesce with either.
    await jobs.enqueueArchiveListing({
      channelId,
      listingReference: "item-1",
      tombstoneVersionAt: new Date().toISOString(),
    });

    startWorker({ prefix, queue: QUEUES.syncListings, registry });

    await waitFor(() => archiveRuns === 1 && listingsRuns >= 1);
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(listingsRuns).toBe(1);
    expect(archiveRuns).toBe(1);
  });
});
