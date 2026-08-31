# 0004 — Clean-break initial sync: listings before orders, baseline inventory rule

- **Status:** Accepted
- **Date:** 2026-08-19

## Context

Channel-derived data was unsound in two directions at once: order lines that
never resolved to a listing variant, and stock double-counted between the
marketplace's view and ours. Any migration that tried to preserve it would be
preserving garbage.

The rework also changes what `stock.quantity` *means* for channel-seeded rows
(now: marketplace **available** as observed at `seed_observed_at`), drops
`stock_effect` / `order_line_stock_assignment` without backfill, and adds a
unique index on `stock (product_variant_id, warehouse_id)` that pre-existing
duplicate rows would abort.

## Decision

**Wipe channel-derived data and rebuild from the marketplace.** No backfill.

Three coupled rules:

1. **Listings sync before orders.** Channel connect enqueues listings only; the
   listings processor chains the first orders pull. Orders arriving before their
   listings exist can't resolve `listing_variant_id`, which is what produced the
   unlinked lines.
2. **Baseline inventory rule.** Stock seeded from a listing carries
   `seed_basis = 'listing_available'` and `seed_observed_at`. Orders are
   classified pre- or post-seed against that timestamp; pre-seed orders get a
   "Baseline uplift" `adjust` ledger row rather than being deducted twice.
3. **Merged inventory state row.** `order_line_inventory_state` replaces the two
   dropped tables as the single row describing a line's inventory effect.

**The seed observation is stored as bounds, not a point.** The listing's own
provider observation clock when the adapter supplies one (eBay `GetItem`
response `Timestamp` — exact, same clock family as the order clocks), otherwise
app clocks captured before (lower) and after (upper) the page fetch. Order
classification compares against the **lower** bound, restore classification
against the **upper**. In-window events therefore err toward *undersell* in both
directions, never oversell.

The wipe and the migration are **user-executed. Never run by an agent.**

## Alternatives rejected

- **Migrate and backfill existing channel data.** Backfilling from an unsound
  source produces a sound-looking unsound result. The marketplace is the
  authority; refetching is cheaper and correct.
- **Apply migration `0004` before the wipe.** The new `stock` unique index must
  build on an empty table — pre-wipe duplicates abort the migration.
- **A single seed timestamp instead of bounds.** Collapses the clock-skew window
  to a point and picks the wrong side half the time. Bounds let both
  classifications err toward undersell deliberately.
- **Auto-detecting the sequencing at runtime.** Explicit chaining from the
  listings processor is legible; an implicit dependency is not.

## Consequences

- **Accepted losses:** `shipment` rows with `source='local'` (purchased-label
  artifacts), order comments (`order_event`), `product_variant.unit_cost`.
- **Preconditions:** every org that relinks must have a `warehouse` row.
  `initializeStock` silently skips seeding without one, and every line for that
  org then lands `no-stock`.
- **Deploy coupling:** worker and API ship together. The old worker writes the
  dropped tables and must never run against the migrated schema.
- Errors bias toward undersell, never oversell. Preserve that direction in any
  future change to the classification logic.
- Known residuals are documented in the runbook — the fallback clock path
  (Shopify) still carries minutes-scale skew; a pre-seed restore on an order
  also modified post-seed over-uplifts; un-cancel of a pre-seed cancel takes the
  baseline path and over-uplifts. All rare, bounded, and accepted.

## Runbook

The wipe/rollout procedure lives at
[`.plan/clean-break-initial-sync/runbook.md`](../../.plan/clean-break-initial-sync/runbook.md)
until it has been executed, then it is deleted with the rest of that plan.
