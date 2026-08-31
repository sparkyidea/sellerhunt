# Inventory rules

The hardest rules in the product. Inventory errors are **asymmetric**: an
undersell is a lost sale, an oversell is a cancelled order, a defect-rate hit,
and possibly a suspended marketplace account. Every rule here is shaped by that
asymmetry.

---

### INV-001 — Bias every ambiguous inventory decision toward undersell

```yaml
id: INV-001
severity: critical
status: enforced
adr: 0004
code:
  - packages/sync/src/orders/inventory.ts
tests:
  - packages/sync/src/orders/__tests__/inventory.integration.test.ts
```

**Rule.** When a classification or reconciliation can only be resolved one way
under uncertainty, resolve it so we hold *less* sellable stock than reality, never
more.

**Why.** The two errors are not symmetric. Underselling costs one sale.
Overselling costs a cancellation, a marketplace defect metric, and at volume, the
account. There is no threshold at which oversell becomes the cheaper error.

**Violating looks like.** A new branch in the classification path that resolves a
tie by assuming stock is available, "to avoid false stockouts." Any comment
arguing an edge case is rare enough to round toward available.

---

### INV-002 — Seeded stock means *marketplace available at `seed_observed_at`*

```yaml
id: INV-002
severity: critical
status: enforced
adr: 0004
code:
  - packages/sync/src/orders/inventory.ts
  - packages/db/src/schema/inventory.ts
tests:
  - packages/sync/src/orders/__tests__/inventory.integration.test.ts
```

**Rule.** For channel-seeded rows, `stock.quantity` is the marketplace's
**available** count as observed at `seed_observed_at`, carrying
`seed_basis = 'listing_available'`. It is not a physical count and not a running
total we own.

**Why.** The baseline rule keys off this meaning. Reading the column as "units on
the shelf" double-counts every order the marketplace had already decremented
before we connected.

**Violating looks like.** Code treating seeded `quantity` as authoritative
physical stock, or writing to it without updating `seed_basis` /
`seed_observed_at`.

---

### INV-003 — The seed observation is bounds, never a point

```yaml
id: INV-003
severity: critical
status: enforced
adr: 0004
code:
  - packages/sync/src/orders/inventory.ts
  - packages/sync/src/listings/upsert-listings.ts
tests:
  - packages/sync/src/orders/__tests__/inventory.integration.test.ts
```

**Rule.** Store a **lower** and an **upper** bound for the seed observation. Use
the adapter's own provider observation clock when it supplies one (eBay `GetItem`
response `Timestamp` — exact, so lower == upper), otherwise app clocks captured
before the page fetch (lower) and after it (upper).

Order classification compares against the **lower** bound. Restore
classification compares against the **upper** bound.

**Why.** A single timestamp collapses the clock-skew window to a point and picks
the wrong side of it half the time. Comparing each classification against the
bound that errs toward undersell makes in-window events safe in *both*
directions — an implementation of [INV-001](#inv-001--bias-every-ambiguous-inventory-decision-toward-undersell).

**Violating looks like.** Collapsing the two bounds into one column "since
they're usually equal." Comparing order classification against the upper bound,
or restore classification against the lower — each inverts the safe direction.

---

### INV-004 — Comparisons against seed bounds happen SQL-side

```yaml
id: INV-004
severity: high
status: enforced
adr: 0004
code:
  - packages/sync/src/orders/inventory.ts
tests:
  - packages/sync/src/orders/__tests__/inventory.integration.test.ts
```

**Rule.** Timestamp comparisons in the inventory pass are evaluated in SQL, not
in application code.

**Why.** Application-side comparison reintroduces host-timezone hazard at
*hours* scale, which dwarfs the minutes-scale provider skew the bounds are
designed to absorb. Keeping it SQL-side eliminates that class entirely.

**Violating looks like.** Pulling rows into JS and filtering with `new Date()`
comparisons before deciding pre- or post-seed.

---

### INV-005 — An org with no warehouse seeds no stock

```yaml
id: INV-005
severity: high
status: enforced
adr: 0004
code:
  - packages/sync/src/orders/inventory.ts
tests:
  - packages/sync/src/orders/__tests__/inventory.integration.test.ts
```

**Rule.** `initializeStock` silently skips seeding for an organization with no
`warehouse` row. Every order line for that org then lands `no-stock`.

**Why.** It is a real precondition of channel connect, not a bug — but it fails
*quietly*, so it must be checked before any relink or wipe/rollout, and surfaced
in onboarding.

**Violating looks like.** A connect or relink flow that doesn't verify a
warehouse exists first. Treating a wave of `no-stock` lines as a sync bug when
it's a missing warehouse.

---

### INV-006 — One stock row per (variant, warehouse)

```yaml
id: INV-006
severity: critical
status: enforced
adr: 0004
code:
  - packages/db/src/schema/inventory.ts
tests:
  - packages/db/src/__tests__/migrations.integration.test.ts
```

**Rule.** `stock` is unique on `(product_variant_id, warehouse_id)`, enforced by
a DB index.

**Why.** Duplicate rows make "how much do we have" ambiguous, and every reader
picks a different answer. The DB is the only place this can be guaranteed.

**Violating looks like.** Application-level "find or create" without an upsert
against the unique index. Note that manual `stockRouter.create` of a duplicate
now errors at the DB rather than silently creating an ambiguous row — that error
is correct behaviour, not a regression to paper over.

---

### INV-007 — Pre-seed orders get a baseline uplift, not a deduction

```yaml
id: INV-007
severity: critical
status: enforced
adr: 0004
code:
  - packages/sync/src/orders/inventory.ts
tests:
  - packages/sync/src/orders/__tests__/inventory.integration.test.ts
```

**Rule.** An order classified as pre-seed writes a "Baseline uplift" `adjust`
ledger row. It is never deducted from seeded stock.

**Why.** The marketplace had already decremented its available count for that
order before we observed it. Deducting again double-counts and drives stock
negative — the classic oversell precursor.

**Violating looks like.** Negative stock after an initial sync. A deduction path
that doesn't consult the seed classification.

---

### INV-008 — Inventory effect for a line lives on one merged state row

```yaml
id: INV-008
severity: high
status: enforced
adr: 0004
code:
  - packages/sync/src/orders/inventory.ts
  - packages/db/src/schema/inventory.ts
tests:
  - packages/sync/src/orders/__tests__/inventory.integration.test.ts
```

**Rule.** `order_line_inventory_state` is the single row describing a line's
inventory effect. The former `stock_effect` and `order_line_stock_assignment`
tables are gone and must not be reintroduced.

**Why.** Two tables describing one fact drifted, and reconciling them required
guessing which was right. One row, one answer.

**Violating looks like.** A new side table recording per-line stock movement
"for audit". Audit belongs in `stock_transaction`, not a parallel state table.
