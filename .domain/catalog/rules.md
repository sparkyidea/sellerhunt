# Catalog rules

Product, variant, stock, warehouse, and the category taxonomy. Channel-agnostic
— this is our own truth. See [`category.md`](category.md) for the taxonomy model,
and [`../inventory/rules.md`](../inventory/rules.md) for stock semantics.

---

### CAT-001 — An unmapped marketplace category is a normal state

```yaml
id: CAT-001
severity: high
status: enforced
code:
  - packages/db/src/schema/marketplace-category.ts
tests:
  - packages/taxonomy/test/index.test.ts
```

**Rule.** `marketplace_category.categoryId` is nullable and often null. Sync
records the raw reference, logs the miss, and continues. An unmapped category
never blocks or fails a pull.

**Why.** Marketplace taxonomies change faster than our mapping data. Treating a
miss as an error means one new eBay leaf category halts a seller's entire
listing sync.

**Violating looks like.** A throw or an aborted batch on lookup miss. A non-null
constraint on `categoryId`.

---

### CAT-002 — `siteId` is part of marketplace category identity

```yaml
id: CAT-002
severity: critical
status: enforced
code:
  - packages/db/src/schema/marketplace-category.ts
tests:
  - packages/taxonomy/test/index.test.ts
```

**Rule.** Identity is `(marketplaceId, siteId, reference)`, enforced by a unique
index. Lookups must pass `siteId`.

**Why.** eBay category `9355` means different things on different sites.
Dropping `siteId` maps a UK listing to a US category — wrong data, silently, in
a field nobody checks.

**Violating looks like.** `lookupCategory(marketplace, reference)` with no site.
A cache keyed on reference alone.

---

### CAT-003 — Category mapping is many-to-one, never the reverse

```yaml
id: CAT-003
severity: high
status: enforced
code:
  - packages/db/src/schema/category.ts
  - packages/db/src/schema/marketplace-category.ts
tests:
  - packages/taxonomy/test/index.test.ts
```

**Rule.** Many marketplace categories map to one canonical category. One
marketplace category never maps to several canonical ones.

**Why.** The canonical category is what cross-listing and merge matching key on.
A one-to-many mapping makes "what category is this product" ambiguous, and every
consumer resolves the ambiguity differently.

**Violating looks like.** A join table between `marketplace_category` and
`category`. Ranked or scored multi-mappings — that is what `mappingConfidence`
on the single mapping is for.

---

### CAT-004 — Canonical category IDs are Shopify's, not generated

```yaml
id: CAT-004
severity: medium
status: enforced
code:
  - packages/db/src/schema/category.ts
tests:
  - packages/taxonomy/test/index.test.ts
```

**Rule.** `category.id` is the upstream Shopify taxonomy id (`"aa-1-1"`).

**Why.** A taxonomy refresh becomes an upsert rather than a full remap, and
mappings survive it. Generated ids would orphan every mapping on each refresh.

**Violating looks like.** A uuid default on `category.id`. A separate
`externalId` column shadowing it.
