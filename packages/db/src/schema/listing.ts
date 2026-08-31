import { relations, type SQL, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { tsvector } from "../utils/custom-types";
import { organization, user } from "./auth";
import { channel } from "./channel";
import { marketplaceCategory } from "./marketplace-category";
import { product, productVariant } from "./product";

export const listingStatusEnum = pgEnum("listing_status", [
  "active",
  "inactive",
  "out_of_stock",
  "draft",
  "sold",
  "ended",
]);

export const listing = pgTable(
  "listing",
  {
    // IDs
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    productId: text("product_id").references(() => product.id),
    channelId: text("channel_id").references(() => channel.id, {
      onDelete: "cascade",
    }),
    marketplaceCategoryId: text("marketplace_category_id").references(
      () => marketplaceCategory.id,
      { onDelete: "set null" }
    ),
    reference: text("reference"),

    // Details
    title: text("title").notNull(),
    subTitle: text("sub_title"),
    description: text("description"),
    descriptionHtml: text("description_html"),
    type: text("type").notNull(),
    url: text("url").notNull(),
    brand: text("brand"),
    manufacturer: text("manufacturer"),
    condition: text("condition").notNull(),
    conditionNote: text("condition_note"),
    imageUrls: text("image_urls").array(),
    watchCount: integer("watch_count"),
    viewCount: integer("view_count"),
    duration: text("duration"),
    status: listingStatusEnum("status").notNull(),
    variant: boolean("variant").notNull().default(false),

    // Offers
    offer: boolean("offer").default(false),
    offerAcceptPrice: integer("offer_accept_price"), // cents
    offerDeclinePrice: integer("offer_decline_price"), // cents

    // Returns
    domesticReturn: boolean("domestic_return").notNull().default(false),
    domesticReturnWindow: integer("domestic_return_window"), // days
    domesticReturnPaidBy: text("domestic_return_paid_by"),
    internationalReturn: boolean("international_return")
      .notNull()
      .default(false),
    internationalReturnWindow: integer("international_return_window"), // days
    internationalReturnPaidBy: text("international_return_paid_by"),
    restockingFee: integer("restocking_fee"), // cents

    // Shipping
    localPickup: boolean("local_pickup").notNull().default(false),
    handlingTime: integer("handling_time").notNull(), // days
    handlingFee: integer("handling_fee"), // cents
    domesticShipping: boolean("domestic_shipping").notNull().default(false),
    domesticShippingType: text("domestic_shipping_type"),
    domesticShippingBaseFee: integer("domestic_shipping_base_fee"), // cents
    domesticShippingAdditionalFee: integer("domestic_shipping_additional_fee"), // cents
    internationalShipping: boolean("international_shipping")
      .notNull()
      .default(false),
    internationalShippingType: text("international_shipping_type"),
    internationalShippingBaseFee: integer("international_shipping_base_fee"), // cents
    internationalShippingAdditionalFee: integer(
      "international_shipping_additional_fee"
    ), // cents

    // Timestamps
    startedAt: timestamp("started_at").notNull(),
    endedAt: timestamp("ended_at"),
    syncedAt: timestamp("synced_at"),
    syncStatus: text("sync_status"),
    syncError: text("sync_error"),
    /**
     * Provider version clock of the snapshot this row was last written from.
     * Shopify: webhook `updatedAt` / `X-Shopify-Triggered-At` for tombstones.
     * eBay: the captured API response `Timestamp` — an observation version,
     * comparable only against other eBay observations. Stale guard as on
     * `order.sourceVersionAt`; an older update can never un-archive a row.
     */
    sourceVersionAt: timestamp("source_version_at"),
    /**
     * Local Postgres clock (`now()` in SQL, never the app clock), stamped on
     * every successful observation of this listing at the marketplace. Full
     * reconciliation archives unseen rows only where
     * `lastObservedAt <= run.startedAt`, with `run.startedAt` also
     * PG-generated so both sides of the predicate share one clock.
     */
    lastObservedAt: timestamp("last_observed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),

    archived: boolean("archived").notNull().default(false),
    /** When the tombstone landed (delete webhook or full reconciliation). */
    archivedAt: timestamp("archived_at"),

    // Full-text search (generated column — auto-computed by PostgreSQL)
    search: tsvector("search").generatedAlwaysAs(
      (): SQL => sql`
        setweight(to_tsvector('english', coalesce(${listing.title}, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(${listing.subTitle}, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(${listing.brand}, '')), 'B')
      `
    ),
  },
  (table) => [
    uniqueIndex("listing_organization_id_channel_id_reference_unique").on(
      table.organizationId,
      table.channelId,
      table.reference
    ),
    index("listing_organization_id_idx").on(table.organizationId),
    index("listing_product_id_idx").on(table.productId),
    index("listing_channel_id_idx").on(table.channelId),
    index("listing_reference_idx").on(table.reference),
    index("listing_status_idx").on(table.status),
    index("listing_created_at_idx").on(table.createdAt),
    index("listing_search_idx").using("gin", table.search),
    index("listing_marketplace_category_id_idx").on(
      table.marketplaceCategoryId
    ),
  ]
);

export const listingVariant = pgTable(
  "listing_variant",
  {
    // IDs
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    listingId: text("listing_id")
      .notNull()
      .references(() => listing.id, { onDelete: "cascade" }),
    // Rule: LST-001 — the single channel↔catalog join. Where this is
    // null, inventory can't be attributed and order lines can't resolve.
    // Do not add a second linking path (read-time SKU matching) that
    // bypasses it.
    productVariantId: text("product_variant_id").references(
      () => productVariant.id,
      { onDelete: "set null" }
    ),
    reference: text("reference").notNull(),

    // Details
    sku: text("sku"),
    model: text("model"),
    upc: text("upc"),
    ean: text("ean"),
    isbn: text("isbn"),
    gtin: text("gtin"),
    attributes: jsonb("attributes").$type<Record<string, string>>(),
    price: integer("price").notNull(), // cents
    quantity: integer("quantity").notNull(),
    sold: integer("sold").notNull().default(0),
    length: integer("length").notNull(), // millimeters
    width: integer("width").notNull(), // millimeters
    height: integer("height").notNull(), // millimeters
    weight: integer("weight").notNull(), // milligrams
    imageUrls: text("image_urls").array(),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("listing_variant_listing_id_reference_unique").on(
      table.listingId,
      table.reference
    ),
    index("listing_variant_organization_id_idx").on(table.organizationId),
    index("listing_variant_listing_id_idx").on(table.listingId),
    index("listing_variant_product_variant_id_idx").on(table.productVariantId),
    index("listing_variant_sku_idx").on(table.sku),
    index("listing_variant_reference_idx").on(table.reference),
  ]
);

export const listingRelations = relations(listing, ({ many, one }) => ({
  listingVariants: many(listingVariant),
  channel: one(channel, {
    fields: [listing.channelId],
    references: [channel.id],
  }),
  product: one(product, {
    fields: [listing.productId],
    references: [product.id],
  }),
  marketplaceCategory: one(marketplaceCategory, {
    fields: [listing.marketplaceCategoryId],
    references: [marketplaceCategory.id],
  }),
}));

export const listingVariantRelations = relations(listingVariant, ({ one }) => ({
  listing: one(listing, {
    fields: [listingVariant.listingId],
    references: [listing.id],
  }),
  productVariant: one(productVariant, {
    fields: [listingVariant.productVariantId],
    references: [productVariant.id],
  }),
}));
