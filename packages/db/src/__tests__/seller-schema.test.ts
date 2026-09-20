import { getTableConfig } from "drizzle-orm/pg-core";
import { expect, it } from "vitest";
import { scanSeller } from "../schema/scan";

it("keeps only seller identity and marketplace-scoped freshness indexes", () => {
  const { indexes } = getTableConfig(scanSeller);
  expect(indexes.map((index) => index.config.name)).toEqual([
    "scan_seller_marketplace_reference_unique",
    "scan_seller_marketplace_last_scanned_at_idx",
  ]);
  expect(indexes[0]?.config.unique).toBe(true);
  expect(indexes[0]?.config.columns).toMatchObject([
    { name: "marketplace" },
    { name: "reference" },
  ]);
  expect(indexes[1]?.config.columns).toMatchObject([
    { name: "marketplace" },
    { name: "last_scanned_at" },
  ]);
  expect(scanSeller.id.primary).toBe(true);
});
