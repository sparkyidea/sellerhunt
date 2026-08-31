import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createDbClient } from "../client";
import { marketplace } from "../schema";
import { migrateTestDb, TEST_DATABASE_URL } from "../testing";

let client: ReturnType<typeof createDbClient>;

beforeAll(async () => {
  await migrateTestDb();
  client = createDbClient(TEST_DATABASE_URL);
});

afterAll(async () => {
  await client.close();
});

it("applies migrations including the P1a objects", async () => {
  const result = await client.db.execute(sql`
    SELECT to_regclass('public.channel_sync_state') AS channel_sync_state,
           to_regclass('public.order_line_inventory_state') AS order_line_inventory_state,
           to_regclass('public.channel_webhook_subscription') AS channel_webhook_subscription
  `);
  expect(result.rows[0]).toEqual({
    channel_sync_state: "channel_sync_state",
    order_line_inventory_state: "order_line_inventory_state",
    channel_webhook_subscription: "channel_webhook_subscription",
  });
});

it("drops the merged inventory tables and adds the clean-break columns", async () => {
  const dropped = await client.db.execute(sql`
    SELECT to_regclass('public.stock_effect') AS stock_effect,
           to_regclass('public.order_line_stock_assignment') AS order_line_stock_assignment
  `);
  expect(dropped.rows[0]).toEqual({
    stock_effect: null,
    order_line_stock_assignment: null,
  });

  const columns = await client.db.execute(sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE (table_name = 'stock' AND column_name IN ('seed_basis', 'seed_observed_at', 'seed_observed_upper_at'))
       OR (table_name = 'order_line' AND column_name = 'listing_variant_reference')
       OR (table_name = 'order' AND column_name = 'remote_missing_at')
    ORDER BY column_name
  `);
  expect(columns.rows.map((row) => row.column_name)).toEqual([
    "listing_variant_reference",
    "remote_missing_at",
    "seed_basis",
    "seed_observed_at",
    "seed_observed_upper_at",
  ]);

  const uniqueIndex = await client.db.execute(sql`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'stock'
      AND indexname = 'stock_product_variant_warehouse_unique'
  `);
  expect(uniqueIndex.rows).toHaveLength(1);
});

it("round-trips a row through the real database", async () => {
  const id = `integration-test-${crypto.randomUUID()}`;
  await client.db.insert(marketplace).values({ id, name: "Integration Test" });
  const [row] = await client.db
    .select()
    .from(marketplace)
    .where(eq(marketplace.id, id));
  expect(row?.name).toBe("Integration Test");
  await client.db.delete(marketplace).where(eq(marketplace.id, id));
});
