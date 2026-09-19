/**
 * Scan schema — third-party listings/sellers our scanner has fetched, plus
 * the scanner's own control plane (keyword pool, per-marketplace config).
 *
 * Scan records are global, not user-scoped. The same marketplace listing
 * observed by multiple users is one row.
 *
 * Tables in this file:
 *   - scan_seller             snapshot of a marketplace seller's stats
 *   - scan_listing            current listing details and sales
 *   - scan_listing_variant    current sellable units, including defaults
 *   - scan_listing_snapshot   listing sales history
 *   - scan_keyword            keyword pool driving discovery + the phrases the
 *                             LLM learned from titles (one row per marketplace+keyword)
 *   - scan_config             per-marketplace scanner control plane
 *
 * Keywords form an independent discovery pool, with no listing relationship.
 *
 * The mobile-app device personas that mint bearer tokens for the unofficial
 * APIs live in `./mobile-profile.ts` — those are reusable beyond the scanner.
 *
 * Money columns are integer cents (consistent with the rest of the schema).
 * Variants and snapshots inherit marketplace identity from their listing.
 */
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const scanSeller = pgTable(
  "scan_seller",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    marketplace: text("marketplace").notNull(),
    /** Marketplace's seller identifier (eBay username, Shopify shop handle, etc.). */
    reference: text("reference").notNull(),

    displayName: text("display_name"),
    logoUrl: text("logo_url"),

    // Reputation
    /** Lifetime feedback count. */
    feedbackScore: integer("feedback_score"),
    /** Positive feedback as 0..1 (0.998 = 99.8%). */
    feedbackPercent: numeric("feedback_percent", { precision: 5, scale: 4 }),
    /** Lifetime items sold (rounded; eBay only surfaces K/M-suffixed counts). */
    totalItemsSold: integer("total_items_sold"),

    /** Opt-in: tighten freshness/alerting on this seller. */
    monitored: boolean("monitored").notNull().default(false),

    lastScannedAt: timestamp("last_scanned_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("scan_seller_marketplace_reference_unique").on(
      t.marketplace,
      t.reference
    ),
    /** Cron tick query: stale sellers per marketplace, ordered by oldest first. */
    index("scan_seller_marketplace_last_scanned_at_idx").on(
      t.marketplace,
      t.lastScannedAt
    ),
  ]
);

export const scanListing = pgTable(
  "scan_listing",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    marketplace: text("marketplace").notNull(),
    reference: text("reference").notNull(),
    sellerId: text("seller_id").references(() => scanSeller.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    description: text("description"),
    condition: text("condition"),
    marketplaceCategoryReference: text("marketplace_category_reference"),
    categoryPath: text("category_path").array(),
    imageUrls: text("image_urls").array(),
    url: text("url"),
    startedAt: timestamp("started_at"),
    endedAt: timestamp("ended_at"),
    itemSold: integer("item_sold"),
    soldLast24h: integer("sold_last_24h"),
    soldLast30Days: integer("sold_last_30_days"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    lastScannedAt: timestamp("last_scanned_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("scan_listing_marketplace_reference_unique").on(
      t.marketplace,
      t.reference
    ),
    index("scan_listing_seller_id_idx").on(t.sellerId),
    index("scan_listing_marketplace_last_scanned_at_idx").on(
      t.marketplace,
      t.lastScannedAt,
      t.id
    ),
  ]
);

/** Current sellable units, including a default unit for simple listings. */
export const scanListingVariant = pgTable(
  "scan_listing_variant",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    listingId: text("listing_id")
      .notNull()
      .references(() => scanListing.id, { onDelete: "cascade" }),
    reference: text("reference").notNull(),
    sku: text("sku"),
    attributes: jsonb("attributes").$type<Record<string, string>>(),
    imageUrls: text("image_urls").array(),
    price: integer("price"),
    currency: text("currency"),
    status: text("status").$type<"in_stock" | "out_of_stock" | "removed">(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("scan_listing_variant_listing_id_reference_unique").on(
      t.listingId,
      t.reference
    ),
    check(
      "scan_listing_variant_status_check",
      sql`${t.status} IN ('in_stock', 'out_of_stock', 'removed')`
    ),
    check("scan_listing_variant_price_check", sql`${t.price} >= 0`),
  ]
);

/** Listing sales measurements saved with each completed full scan. */
export const scanListingSnapshot = pgTable(
  "scan_listing_snapshot",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    listingId: text("listing_id")
      .notNull()
      .references(() => scanListing.id, { onDelete: "cascade" }),
    itemSold: integer("item_sold"),
    soldLast24h: integer("sold_last_24h"),
    soldLast30Days: integer("sold_last_30_days"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("scan_listing_snapshot_history_idx").on(
      t.listingId,
      t.createdAt,
      t.id
    ),
  ]
);

/**
 * Keyword pool for scanner discovery **and** the phrases the LLM learned from
 * listing titles. One row per (marketplace, keyword). The keyword is the
 * lowercase search phrase exactly as the model returned it (e.g. "mcdonald's
 * fifa world cup squishmallows") — a search term, never a product identity.
 *
 * Lifecycle:
 *   - Manual seed: `source = "manual"` via the seed script.
 *   - Learned: `source = "llm"` when the scan's LLM stage extracts a phrase no
 *     row has yet. An exact match reuses the existing row (manual or llm).
 *   - Seen again: extraction bumps `last_seen_at` only — never `last_scanned_at` — so
 *     learning a keyword doesn't skip its next scheduled search.
 *   - Dead: scanner sets `dead_at` after repeated empty scans, removing the
 *     row from search rotation without deleting it.
 */
export const scanKeyword = pgTable(
  "scan_keyword",
  {
    /**
     * Surrogate for FKs. DB-side default (not `$defaultFn`) so the column
     * could be added to an already-populated table.
     */
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    marketplace: text("marketplace").notNull(),
    /** Lowercase search phrase, e.g. "nintendo switch". */
    keyword: text("keyword").notNull(),
    /** "manual" (operator-seeded) or "llm" (learned from a listing title). */
    source: text("source").notNull(),

    firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
    /** Bumped each time a listing title produces this keyword. */
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
    /** Last time the scanner walked search results for this keyword. */
    lastScannedAt: timestamp("last_scanned_at"),
    /** Set when scanner gives up on this keyword. */
    deadAt: timestamp("dead_at"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("scan_keyword_marketplace_keyword_unique").on(
      t.marketplace,
      t.keyword
    ),
    /** Cron tick query: stale keywords per marketplace, ordered oldest first. */
    index("scan_keyword_marketplace_last_scanned_at_idx").on(
      t.marketplace,
      t.lastScannedAt
    ),
  ]
);

/**
 * Per-marketplace scanner config. One row per supported marketplace
 * (e.g. "ebay", "shop"). Seeded once via a seed script; tuned via UPDATE.
 *
 * Only kill switches, business thresholds and per-marketplace tuning live
 * here. Anything fixed by the code's design — the LLM model, reasoning
 * effort and titles-per-request cap (`keywords/extract-keywords.ts`), the
 * sequential leaf pacing, the retry tool's page size — is a constant next to
 * that code, not a row value.
 *
 * The cron reads this row first thing on every tick — if `enabled = false`,
 * it returns immediately without triggering any scan tasks.
 */
export const scanConfig = pgTable("scan_config", {
  marketplace: text("marketplace").primaryKey(),

  /** Master kill switch — cron exits early when false. */
  enabled: boolean("enabled").notNull().default(true),

  /**
   * Pages walked per keyword scan (depth of discovery). Seller stores have no
   * such knob: a seller scan walks the whole store to `pagination.totalPages`
   * (runaway guard `MAX_SELLER_PAGES` in `scan-listings-by-seller.ts`).
   */
  maxSearchPages: integer("max_search_pages").notNull().default(10),

  /** Drop listings whose itemSold is below this. */
  minItemSold: integer("min_item_sold").notNull().default(0),
  /** Drop listings whose price (cents) is below this. */
  minPriceCents: integer("min_price_cents").notNull().default(0),
  /** Cap on listing price (cents). NULL = no cap. */
  maxPriceCents: integer("max_price_cents"),
  /** Drop listings whose soldLast24h is below this. NULL = no requirement. */
  minSoldLast24h: integer("min_sold_last_24h"),

  /** Stale keywords pulled per cron firing. */
  keywordBatchSize: integer("keyword_batch_size").notNull().default(20),
  /** Stale sellers pulled per cron firing. */
  sellerBatchSize: integer("seller_batch_size").notNull().default(20),
  /** Stale listings pulled per cron firing (orphan catch). */
  listingBatchSize: integer("listing_batch_size").notNull().default(50),

  /**
   * Listings scanned per `scan-listings-by-ids` leaf run (batch size K). Also
   * the launcher/leaf dispatch threshold: a run handed more than this many ids
   * self-fans into K-sized child runs; one handed `<= K` scans them inline.
   * 50 by default — one box scraping 50 listings per run is accepted, and it
   * matches the LLM request cap so a leaf makes one LLM call. Fetches within
   * a leaf are always sequential. NOT the same as `listingBatchSize` (cron
   * pick).
   */
  listingScanBatchSize: integer("listing_scan_batch_size")
    .notNull()
    .default(50),
  /** Min jittered delay (ms) before each getListing in a leaf run. */
  listingScanDelayMinMs: integer("listing_scan_delay_min_ms")
    .notNull()
    .default(200),
  /** Max jittered delay (ms) before each getListing in a leaf run. */
  listingScanDelayMaxMs: integer("listing_scan_delay_max_ms")
    .notNull()
    .default(800),

  // Keyword extraction (title → scan_keyword). LLM only, once per new listing.
  // Model, reasoning effort and request size are code constants.
  /** LLM kill switch. Off skips keyword extraction for new listings. */
  keywordLlmEnabled: boolean("keyword_llm_enabled").notNull().default(true),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const scanSellerRelations = relations(scanSeller, ({ many }) => ({
  listings: many(scanListing),
}));

export const scanListingRelations = relations(scanListing, ({ many, one }) => ({
  seller: one(scanSeller, {
    fields: [scanListing.sellerId],
    references: [scanSeller.id],
  }),
  variants: many(scanListingVariant),
  snapshots: many(scanListingSnapshot),
}));

export const scanListingVariantRelations = relations(
  scanListingVariant,
  ({ one }) => ({
    listing: one(scanListing, {
      fields: [scanListingVariant.listingId],
      references: [scanListing.id],
    }),
  })
);

export const scanListingSnapshotRelations = relations(
  scanListingSnapshot,
  ({ one }) => ({
    listing: one(scanListing, {
      fields: [scanListingSnapshot.listingId],
      references: [scanListing.id],
    }),
  })
);
