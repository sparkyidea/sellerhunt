import { createTableRelationsHelpers } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { expect, it } from "vitest";
// biome-ignore lint/performance/noNamespaceImport: verify the complete schema export contract
import * as schema from "../schema/scan";

const models = [
  {
    table: schema.scanListing,
    columns:
      "id marketplace reference seller_id title description condition marketplace_category_reference category_path image_urls url started_at ended_at item_sold sold_last_24h sold_last_30_days created_at last_scanned_at",
    required: "id marketplace reference title created_at last_scanned_at",
  },
  {
    table: schema.scanListingVariant,
    columns:
      "id listing_id reference sku attributes image_urls price currency status created_at updated_at",
    required: "id listing_id reference status created_at updated_at",
  },
  {
    table: schema.scanListingSnapshot,
    columns:
      "id listing_id item_sold sold_last_24h sold_last_30_days created_at",
    required: "id listing_id created_at",
  },
];

it.each(models)("enforces the exact column contract: $columns", (model) => {
  const { columns } = getTableConfig(model.table);
  expect(columns.map((column) => column.name)).toEqual(
    model.columns.split(" ")
  );
  expect(
    columns.filter((column) => column.notNull).map((column) => column.name)
  ).toEqual(model.required.split(" "));
  expect(
    columns.filter((column) => column.primary).map((column) => column.name)
  ).toEqual(["id"]);
});

it("keeps nullable integer measurements and required status", () => {
  for (const table of [schema.scanListing, schema.scanListingSnapshot]) {
    for (const column of [
      table.itemSold,
      table.soldLast24h,
      table.soldLast30Days,
    ]) {
      expect(column.getSQLType()).toBe("integer");
      expect(column.notNull).toBe(false);
    }
    expect(getTableConfig(table).checks).toHaveLength(0);
  }
  expect(schema.scanListingVariant.price.getSQLType()).toBe("integer");
  expect(schema.scanListingVariant.price.notNull).toBe(false);
  expect(schema.scanListingVariant.status.notNull).toBe(true);
  expect(
    getTableConfig(schema.scanListingVariant).checks.map((check) => check.name)
  ).toEqual([
    "scan_listing_variant_status_check",
    "scan_listing_variant_price_check",
  ]);
});

it("retains unique identities and indexed freshness/history", () => {
  const listing = getTableConfig(schema.scanListing);
  const variant = getTableConfig(schema.scanListingVariant);
  const snapshot = getTableConfig(schema.scanListingSnapshot);
  expect(listing.indexes.map((index) => index.config.name)).toEqual([
    "scan_listing_marketplace_reference_unique",
    "scan_listing_seller_id_idx",
    "scan_listing_marketplace_last_scanned_at_idx",
  ]);
  expect(variant.indexes.map((index) => index.config.name)).toEqual([
    "scan_listing_variant_listing_id_reference_unique",
  ]);
  expect(snapshot.indexes.map((index) => index.config.name)).toEqual([
    "scan_listing_snapshot_history_idx",
  ]);
  expect(
    listing.indexes.find((index) => index.config.unique)?.config.columns
  ).toMatchObject([{ name: "marketplace" }, { name: "reference" }]);
  expect(
    variant.indexes.find((index) => index.config.unique)?.config.columns
  ).toMatchObject([{ name: "listing_id" }, { name: "reference" }]);
  expect(
    listing.indexes.find(
      (index) =>
        index.config.name === "scan_listing_marketplace_last_scanned_at_idx"
    )?.config.columns
  ).toMatchObject([
    { name: "marketplace" },
    { name: "last_scanned_at" },
    { name: "id" },
  ]);
  expect(snapshot.indexes[0]?.config.columns).toMatchObject([
    { name: "listing_id" },
    { name: "created_at" },
    { name: "id" },
  ]);
  expect(
    listing.indexes.find(
      (index) => index.config.name === "scan_listing_seller_id_idx"
    )?.config.columns
  ).toMatchObject([{ name: "seller_id" }]);
});

it("owns variants and history through the listing with cascading deletion", () => {
  for (const table of [schema.scanListingVariant, schema.scanListingSnapshot]) {
    const { foreignKeys } = getTableConfig(table);
    expect(foreignKeys).toHaveLength(1);
    expect(foreignKeys[0]?.onDelete).toBe("cascade");
    expect(foreignKeys[0]?.reference().foreignTable).toBe(schema.scanListing);
  }
  const { foreignKeys } = getTableConfig(schema.scanListing);
  expect(foreignKeys).toHaveLength(1);
  expect(foreignKeys[0]?.onDelete).toBe("set null");
  expect(foreignKeys[0]?.reference().foreignTable).toBe(schema.scanSeller);
});

it("uses an explicitly written listing scan time without changing variant timestamps", () => {
  expect(schema.scanListing).not.toHaveProperty("updatedAt");
  expect(schema.scanListing.lastScannedAt.getSQLType()).toBe("timestamp");
  expect(schema.scanListing.lastScannedAt.onUpdateFn).toBeUndefined();
  expect(schema.scanListingVariant.updatedAt.onUpdateFn).toBeDefined();
});

it("exposes listing history without keyword links or variant history", () => {
  const listing = schema.scanListingRelations.config(
    createTableRelationsHelpers(schema.scanListing)
  );
  const variant = schema.scanListingVariantRelations.config(
    createTableRelationsHelpers(schema.scanListingVariant)
  );
  const snapshot = schema.scanListingSnapshotRelations.config(
    createTableRelationsHelpers(schema.scanListingSnapshot)
  );
  expect(Object.keys(listing).sort()).toEqual([
    "seller",
    "snapshots",
    "variants",
  ]);
  expect(Object.keys(variant)).toEqual(["listing"]);
  expect(Object.keys(snapshot)).toEqual(["listing"]);
  expect(schema).not.toHaveProperty("scanListingVariantSnapshot");
  expect(schema).not.toHaveProperty("scanListingVariantSnapshotRelations");
  expect(schema).not.toHaveProperty("scanObservationSequence");
  expect(schema).not.toHaveProperty("scanKeywordRelations");
});
