# Listing rules

A **listing** is a product as it appears on one channel. Its variants are the
join between channel and catalog.

---

### LST-001 — `listing_variant` is the channel↔catalog join

```yaml
id: LST-001
severity: critical
status: enforced
code:
  - packages/db/src/schema/listing.ts
  - packages/sync/src/listings/upsert-listings.ts
tests:
  - packages/sync/src/listings/__tests__/listings.integration.test.ts
```

**Rule.** `listingVariant.productVariantId` is the single link from channel data
to catalog data. Where it is null, inventory cannot be attributed and order lines
cannot resolve.

**Why.** Everything downstream — stock, merge suggestions, cross-listing, weight
for shipping — routes through this FK. A null here is not cosmetic; it is a line
of business that silently doesn't work for that variant.

**Violating looks like.** A second path linking listings to catalog (matching on
SKU at read time, say) that bypasses the FK. Treating null as "not yet
important."

---

### LST-002 — Listings are pulled before the orders that reference them

```yaml
id: LST-002
severity: critical
status: enforced
adr: 0004
code:
  - packages/sync/src/listings/upsert-listings.ts
tests:
  - packages/sync/src/listings/__tests__/listings.integration.test.ts
```

**Rule.** See [SYN-005](../sync/rules.md#syn-005--listings-sync-before-orders-always).
Stated here too because it is a listing-side guarantee that order code depends on.

**Why.** Order lines can only resolve `listing_variant_id` against variants that
already exist.

**Violating looks like.** Any path that makes listings sync optional or lazy for
a channel that syncs orders.

---

### LST-003 — Listing writes go through the outbox

```yaml
id: LST-003
severity: critical
status: proposed
adr: 0002
code: []
tests: []
```

**Rule.** Price and quantity write-back to a marketplace uses the same
four-piece outbox pattern as shipments.

**Why.** Same failure modes as any other marketplace write — duplicate
application on retry, and silent divergence when a response is lost.
[SYN-001](../sync/rules.md#syn-001--every-marketplace-write-goes-through-the-outbox)
applies to listings exactly as it does to fulfillment.

**Violating looks like.** A direct adapter call from a listing edit mutation —
which is what the first implementation will be tempted to do, because the read
path is already there.

**Status: proposed.** Not built. Planned at `.plan/outbox-listings/`; promote to
`enforced` when it ships with tests.
