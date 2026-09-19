# Agreed listing model

The schema and exact-column tests are authoritative:
`packages/db/src/schema/scan.ts` and
`packages/db/src/__tests__/listing-schema.test.ts`.

| Table | Responsibility | Columns |
| --- | --- | --- |
| scan_listing | Current listing details and sales | id, marketplace, reference, seller_id, title, description, condition, marketplace_category_reference, category_path, image_urls, url, started_at, ended_at, item_sold, sold_last_24h, sold_last_30_days, created_at, last_scanned_at |
| scan_listing_variant | Current sellable units and prices | id, listing_id, reference, sku, attributes, image_urls, price, currency, status, created_at, updated_at |
| scan_listing_snapshot | Listing sales history | id, listing_id, item_sold, sold_last_24h, sold_last_30_days, created_at |

Listing owns variants and snapshots through cascading foreign keys. Seller deletion
sets the listing seller FK to null. Internal IDs are UUID values stored as text.
Listing identity is unique by marketplace/reference; variant identity is unique by
listing/reference. Snapshot history uses the listing_id/created_at/id index.

Keep only primary/unique keys and indexes for listing seller_id, listing
marketplace/last_scanned_at/id, and snapshot listing_id/created_at/id.
The variant listing_id/reference unique index also supports listing-scoped reads.
Standalone listing sales/category indexes and the partial current-variant index
are omitted. Filtering semantics do not change; query performance can be measured
later before adding optional indexes.

Sellers retain their primary key, marketplace/reference unique index, and
marketplace/last_scanned_at scheduling index. The optional feedback_score and
standalone last_scanned_at indexes are omitted; both columns remain unchanged.

A full accepted listing has a nonempty variant set, enforced by the writer.
Native variant IDs are preserved, including native defaults. Only a confirmed
simple listing without a native variant uses the reserved reference `__default__`.
This is not its internal UUID. Missing units become removed; returning units keep IDs.

The worker saves listing, variants and one listing sales snapshot in a transaction.
The target save time sets listing last_scanned_at, observed/changed variant updated_at, and
snapshot created_at. Unchanged sales still create a history point. Unknown remains
NULL, not zero; decreasing source totals are stored, not corrected or clamped.

Sales belong only to the listing. Prices belong only to current variants.
There are no variant snapshots, keyword links/attempts, listing monitoring flag,
has_variations, good_till_cancelled, synthetic flag, scan-start time, observation
sequence, or listing updated_at. Runtime validation checks sales;
the duplicate DB sales checks were removed at the user's request. Existing variant
price/status checks remain.

Target freshness reads listing last_scanned_at. Only scan writes update listings; LLM extraction
writes to the independent keyword pool. Cache hits and failed scans do not refresh
timestamps or append history. Locks prevent interleaved writes, not overlapping
fetches; the last committed scan determines current values without sequence fencing.

Current price range/display excludes removed units but includes unknown/out-of-stock
status. Unknown prices or mixed currencies yield an unknown range. Existing generic
relation filters and rollups continue to include all variants, including removed ones.

## Read-side follow-up

Replace getVariantHistory with getListingHistory, keyed by listingId, optional
inclusive date bounds, bounded limit and a createdAt/id cursor. Newest-first
snapshots include salesDelta using an older lookahead row; missing/decreasing
counters produce null. Replace variant-price history with listing sales history,
remove obsolete fields from the UI, and use lastScannedAt as the last saved scan time.
These API/UI changes are pending; do not deploy this intermediate checkout.

## Timestamp rename checkpoint

The user requested renaming listing updatedAt to lastScannedAt to match seller and
keyword scan timestamps. The schema is updated, retaining the existing default
and required timestamp but removing the general on-update hook. Variant timestamps
are unchanged. Worker write/freshness references, scheduling, tests, and the
lifecycle display now use lastScannedAt. No application migration has been applied.
