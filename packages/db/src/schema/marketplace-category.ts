import {
  boolean,
  index,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { category } from "./category";
import { marketplace } from "./marketplace";

export const marketplaceCategory = pgTable(
  "marketplace_category",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    marketplaceId: text("marketplace_id")
      .notNull()
      .references(() => marketplace.id, { onDelete: "cascade" }),
    siteId: text("site_id"),
    reference: text("reference").notNull(),
    // Rule: CAT-001 — nullable and often null. An unmapped marketplace
    // category is a normal state; sync logs the miss and continues.
    // CAT-003 — many marketplace categories map to ONE canonical category,
    // never the reverse. `mappingConfidence` is how a weak mapping is
    // recorded, not a second mapping row.
    categoryId: text("category_id").references(() => category.id),
    name: text("name").notNull(),
    fullName: text("full_name"),
    parentReference: text("parent_reference"),
    leaf: boolean("leaf").notNull().default(false),
    mappingConfidence: real("mapping_confidence"), // 0.0–1.0
    mappingSource: text("mapping_source"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    // Rule: CAT-002 — `siteId` is part of identity. eBay category 9355
    // means different things on different sites; a lookup or cache keyed
    // on reference alone maps a UK listing to a US category.
    uniqueIndex("mc_marketplace_site_reference_unique").on(
      table.marketplaceId,
      table.siteId,
      table.reference
    ),
    index("mc_marketplace_id_idx").on(table.marketplaceId),
    index("mc_category_id_idx").on(table.categoryId),
  ]
);
