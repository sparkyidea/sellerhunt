/**
 * Scan schema — third-party listings/sellers our scanner has fetched, plus
 * the scanner's own control plane (keyword pool, per-marketplace config).
 *
 * Unlike the seller-side `listing` table, scan records are **global, not
 * user-scoped**. The same eBay listing observed by ten of our users is one
 * row, not ten — the data isn't private to any single user. (Future tier
 * gating will live at the API layer, not in row ownership.)
 *
 * Tables in this file:
 *   - scan_seller             snapshot of a marketplace seller's stats
 *   - scan_listing            snapshot of a single listing (latest values)
 *   - scan_listing_variant    per-variation row (for multi-SKU listings)
 *   - scan_listing_snapshot   append-only timeseries for velocity calcs
 *   - scan_keyword            keyword pool driving discovery
 *   - scan_config             per-marketplace scanner control plane
 *
 * The mobile-app device personas that mint bearer tokens for the unofficial
 * APIs live in `./mobile-profile.ts` — those are reusable beyond the scanner.
 *
 * Money columns are integer cents (consistent with the rest of the schema).
 * `marketplace` is a discriminator on every table so we can support eBay,
 * Shopify, etc. with the same shape.
 *
 * `monitored` boolean: opt-in flag for "watch this entity closely" — the
 * scanner can apply tighter freshness windows or alert on change. False by
 * default; the column is the *only* place "monitor" appears in the schema,
 * with a single, unambiguous meaning.
 */
import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
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
    index("scan_seller_feedback_score_idx").on(t.feedbackScore),
    index("scan_seller_last_scanned_at_idx").on(t.lastScannedAt),
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
    /** Marketplace's listing identifier (eBay item ID, etc.). */
    reference: text("reference").notNull(),
    /**
     * FK to scan_seller. Set-null on seller delete so an orphaned listing
     * still keeps its history rather than vanishing.
     */
    sellerId: text("seller_id").references(() => scanSeller.id, {
      onDelete: "set null",
    }),

    title: text("title").notNull(),
    description: text("description"),

    // Classification
    /** Human-readable condition (e.g. "New/Factory Sealed"). */
    condition: text("condition"),
    /** Marketplace's leaf category ID (matches seller-side listing column). */
    marketplaceCategoryReference: text("marketplace_category_reference"),
    /** Category breadcrumb names, root → leaf. */
    categoryPath: text("category_path").array(),
    imageUrls: text("image_urls").array(),
    url: text("url"),
    /** True when the listing has multiple variations (see scan_listing_variant). */
    variant: boolean("variant").notNull().default(false),

    // Lifecycle
    goodTillCancelled: boolean("good_till_cancelled"),
    startedAt: timestamp("started_at"),
    endedAt: timestamp("ended_at"),

    /**
     * Latest snapshot — denormalized onto the row so list/sort/filter queries
     * don't need to join the snapshot table. Updated on every scan.
     * Historical values live in scan_listing_snapshot.
     */
    price: integer("price"), // cents
    currency: text("currency"),
    itemSold: integer("item_sold"),
    /** eBay-only: sparse "sold in last 24h" hotness signal. */
    soldLast24h: integer("sold_last_24h"),
    /** Shopify-only: approximate quantity sold in last 30 days. */
    soldLast30Days: integer("sold_last_30_days"),

    /** Opt-in: tighten freshness/alerting on this listing. */
    monitored: boolean("monitored").notNull().default(false),

    lastScannedAt: timestamp("last_scanned_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("scan_listing_marketplace_reference_unique").on(
      t.marketplace,
      t.reference
    ),
    index("scan_listing_seller_id_idx").on(t.sellerId),
    index("scan_listing_item_sold_idx").on(t.itemSold),
    index("scan_listing_sold_last_24h_idx").on(t.soldLast24h),
    index("scan_listing_sold_last_30_days_idx").on(t.soldLast30Days),
    index("scan_listing_last_scanned_at_idx").on(t.lastScannedAt),
    index("scan_listing_marketplace_category_reference_idx").on(
      t.marketplaceCategoryReference
    ),
    /** Cron tick query: stale listings per marketplace, ordered by oldest first. */
    index("scan_listing_marketplace_last_scanned_at_idx").on(
      t.marketplace,
      t.lastScannedAt
    ),
  ]
);

export const scanListingVariant = pgTable(
  "scan_listing_variant",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    listingId: text("listing_id")
      .notNull()
      .references(() => scanListing.id, { onDelete: "cascade" }),
    /** Marketplace's variation identifier (eBay variationId, etc.). */
    reference: text("reference").notNull(),

    /**
     * Variant attributes as a name→value map, e.g. {"Character Family": "Mario"}.
     * Mirrors the seller-side `listing_variant.attributes` shape.
     */
    attributes: jsonb("attributes").$type<Record<string, string>>(),
    imageUrls: text("image_urls").array(),

    /** Latest price (cents). Denormed for the same reason as scan_listing.price. */
    price: integer("price"),

    lastScannedAt: timestamp("last_scanned_at"),
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
    index("scan_listing_variant_listing_id_idx").on(t.listingId),
    index("scan_listing_variant_last_scanned_at_idx").on(t.lastScannedAt),
  ]
);

/**
 * Append-only timeseries of listing-level scan results. One row per listing
 * per scan. Used to compute velocity (item_sold delta over time) when the
 * marketplace doesn't surface a windowed count, and to chart trends.
 */
export const scanListingSnapshot = pgTable(
  "scan_listing_snapshot",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    listingId: text("listing_id")
      .notNull()
      .references(() => scanListing.id, { onDelete: "cascade" }),
    scannedAt: timestamp("scanned_at").defaultNow().notNull(),

    price: integer("price"), // cents
    itemSold: integer("item_sold"),
    /** eBay-only: sparse 24h hotness signal. */
    soldLast24h: integer("sold_last_24h"),
    /** Shopify-only: 30-day approximate sold count. */
    soldLast30Days: integer("sold_last_30_days"),
  },
  (t) => [
    index("scan_listing_snapshot_listing_id_scanned_at_idx").on(
      t.listingId,
      t.scannedAt
    ),
  ]
);

/**
 * Keyword pool for scanner discovery. Each row is a (marketplace, keyword)
 * pair. Same word in different marketplaces is two distinct rows.
 *
 * Lifecycle:
 *   - Manual seed: `source = "manual"` via a seed script.
 *   - Auto-extracted: `scanOneListing` extracts keywords from listing
 *     titles and upserts with `source = "extracted"`. ON CONFLICT only bumps
 *     `last_seen_at` — never `last_scanned_at` — so re-extraction doesn't
 *     skip the next scheduled scan of that keyword.
 *   - Dead: scanner sets `dead_at` after repeated empty scans, removing the
 *     row from rotation without deleting (history retained).
 */
export const scanKeyword = pgTable(
  "scan_keyword",
  {
    marketplace: text("marketplace").notNull(),
    /** Normalized lowercase keyword, e.g. "nintendo switch". */
    keyword: text("keyword").notNull(),
    /** "manual" (operator-seeded) or "extracted" (from a listing title). */
    source: text("source").notNull(),

    firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
    /** Bumped each time the keyword reappears in an extracted listing title. */
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
    primaryKey({ columns: [t.marketplace, t.keyword] }),
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
 * The cron reads this row first thing on every tick — if `enabled = false`,
 * it returns immediately without triggering any scan tasks.
 */
export const scanConfig = pgTable("scan_config", {
  marketplace: text("marketplace").primaryKey(),

  /** Master kill switch — cron exits early when false. */
  enabled: boolean("enabled").notNull().default(true),

  /** Minutes after last_scanned_at before a keyword is rescanned. */
  keywordRescanAfter: integer("keyword_rescan_after").notNull().default(1440),
  /** Minutes after last_scanned_at before a seller is rescanned. */
  sellerRescanAfter: integer("seller_rescan_after").notNull().default(1440),
  /** Minutes after last_scanned_at before a listing is rescanned. */
  listingRescanAfter: integer("listing_rescan_after").notNull().default(1440),

  /** Pages walked per keyword scan (safety cap). */
  maxSearchPages: integer("max_search_pages").notNull().default(10),
  /** Pages walked per seller-listings scan (safety cap). */
  maxListingPages: integer("max_listing_pages").notNull().default(50),

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
   * Small K spreads fetches across more boxes/IPs (anti-detection); large K
   * cuts container cold-starts. NOT the same as `listingBatchSize` (cron pick).
   */
  listingScanBatchSize: integer("listing_scan_batch_size")
    .notNull()
    .default(20),
  /** Concurrent getListing calls within one leaf run. 1 = strict sequential. */
  listingScanConcurrency: integer("listing_scan_concurrency")
    .notNull()
    .default(1),
  /** Min jittered delay (ms) before each getListing in a leaf run. */
  listingScanDelayMinMs: integer("listing_scan_delay_min_ms")
    .notNull()
    .default(200),
  /** Max jittered delay (ms) before each getListing in a leaf run. */
  listingScanDelayMaxMs: integer("listing_scan_delay_max_ms")
    .notNull()
    .default(800),

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
