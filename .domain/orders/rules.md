# Order rules

An **order** is a purchase on one channel. See
[`../fulfillment/rules.md`](../fulfillment/rules.md) for shipping it and
[`../inventory/rules.md`](../inventory/rules.md) for its stock effects.

---

### ORD-001 — An order line carries both channel and catalog identity

```yaml
id: ORD-001
severity: high
status: enforced
code:
  - packages/db/src/schema/order.ts
  - packages/sync/src/orders/upsert-orders.ts
tests:
  - packages/sync/src/orders/__tests__/upsert-orders.integration.test.ts
```

**Rule.** `order_line` references `listingVariantId` (what was bought on the
channel) **and** `productVariantId` (what it is in our catalog). Both are
nullable; neither substitutes for the other.

**Why.** They answer different questions. The listing variant is what the
marketplace charged for and what a fulfillment references; the product variant
is what has weight, dimensions, and stock. Collapsing them breaks either
fulfillment or inventory.

**Violating looks like.** Deriving one from the other at read time instead of
resolving and storing both.

---

### ORD-002 — A remotely-missing order is marked, then skipped

```yaml
id: ORD-002
severity: high
status: enforced
adr: 0004
code:
  - packages/sync/src/orders/relink.ts
tests:
  - packages/sync/src/orders/__tests__/relink.integration.test.ts
```

**Rule.** An order that returns `not-found` gets **one** `getOrder`, which
stamps `order.remote_missing_at`. Relink skips marked orders from then on. A
later successful pull clears the mark.

**Why.** Without the mark, every relink pass re-fetches every deleted order
forever — a permanent, growing tax on rate limit that grows with account age.

**Violating looks like.** Retrying `not-found` through the generic retry path.
Deleting the local order instead of marking it — the row is still real history.

---

### ORD-003 — Relink resolves references; it never invents them

```yaml
id: ORD-003
severity: high
status: enforced
adr: 0004
code:
  - packages/sync/src/orders/relink.ts
tests:
  - packages/sync/src/orders/__tests__/relink.integration.test.ts
```

**Rule.** Relink matches an order line to a listing variant only on a stored
reference. A remotely-deleted variant clears the line's reference on the next
re-pull (the fresh snapshot carries none), which removes it from the relink pool.
Unresolved lines stay unresolved.

**Why.** Fuzzy matching an unresolved line to a "close enough" variant attributes
inventory to the wrong product, silently. An unresolved line is visibly wrong; a
mis-resolved one is not.

**Violating looks like.** SKU- or title-similarity fallback in relink. Treating
permanently unresolved eBay lines (orders referencing listings that ended before
the `GetSellerList` window) as a bug to fix by guessing.

---

### ORD-004 — Windowed pulls are idempotent

```yaml
id: ORD-004
severity: high
status: enforced
code:
  - packages/sync/src/orders/sync-channel-orders.ts
  - packages/sync/src/sync-window.ts
tests:
  - packages/sync/src/orders/__tests__/upsert-orders.integration.test.ts
```

**Rule.** Running the same order pull window twice produces the same result as
running it once.

**Why.** Overlapping pulls are deliberate — the chained first pull, the
dispatcher, and webhook-triggered pulls can all fire for one channel. Idempotence
is what makes that overlap harmless rather than a source of duplicate rows.

**Violating looks like.** Insert-without-conflict-target in an order upsert.
Appending to an event/ledger table on every pull rather than on state change.
