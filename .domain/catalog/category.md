# Category taxonomy

Canonical, cross-marketplace product categorization. Two tables, one direction
of truth: every marketplace's own category vocabulary maps *into* ours.

## The two tables

**`category`** — our canonical taxonomy, sourced from [Shopify's Product
Taxonomy](https://github.com/Shopify/product-taxonomy) (~12,378 categories,
8 levels). Self-referencing tree via `parentId`. IDs are Shopify's own
(`"aa-1-1"`), not generated — so a taxonomy refresh is an upsert, not a remap.

`fullName` ("Apparel > Clothing > Activewear") is denormalized on purpose: every
UI that shows a category shows the path, and walking the tree per row is not
worth it.

**`marketplace_category`** — one row per category *in a marketplace's own
vocabulary*, with a nullable FK into `category`. Unique on
`(marketplaceId, siteId, reference)` — `reference` is the marketplace's raw ID
(eBay `"9355"`).

```
category  ◄────────────  marketplace_category
   ▲ ▲                     (marketplaceId, siteId, reference) UNIQUE
   │ └── product.categoryId          mappingConfidence: real 0.0–1.0
   └──── listing.categoryId          mappingSource: text
```

## Why the mapping is a table, not a file

The mapping ships as version-controlled JSON in `packages/taxonomy/`, keyed by
the marketplace's own tree version, and is seeded into
`marketplace_category`. Two reasons it also lives in the DB:

- Listings FK to it, so joins stay in SQL.
- `mappingConfidence` and `mappingSource` make a *bad* mapping visible and
  correctable per row. A file-only mapping can't record "this one was a guess."

## Invariants

- **`marketplace_category.categoryId` is nullable and often null.** An unmapped
  marketplace category is a normal state, not an error. Sync records the raw
  reference and moves on; it never blocks a pull.
- **Mapping is many-to-one.** Many marketplace categories map to one canonical
  category. Never the reverse.
- **`siteId` is part of identity.** eBay category `9355` means different things
  on different sites. Dropping `siteId` from a lookup is a correctness bug.
- Taxonomy versions are pinned per marketplace. A pipeline running without a
  loaded taxonomy version should log loudly rather than silently write nulls.

## Current state

Schema, `getCategory`, and `getCategoryTree` are shipped. **The listing upsert
pipeline does not yet resolve marketplace references into canonical IDs** and
the eBay→Shopify mapping data is largely unseeded — so `listing.categoryId` is
mostly null in practice. Tracked as an open issue.

Attributes (Shopify's ~3,310 per-category attributes with allowed values, mapped
to eBay item specifics) are not built. Prerequisite for smart listing forms and
cross-listing.
