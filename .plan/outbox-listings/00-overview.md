# Outbox for listings — price + quantity write-back

## Context

The shipment outbox flow proves the four-piece pattern works end-to-end:

```
push task  ◄──  fingerprint  ──►  pull protection  ◄──  confirmation
                       ▲
                       │
                tRPC mutation
                (insert + trigger)
```

This PR instantiates the same pattern for **listing-level price and quantity
updates** — the highest-frequency, lowest-risk listing mutations. Title,
description, item-specifics, and variant-level changes are deferred to
follow-ups (`06-followups.md`).

Goal of this PR: a seller can change price or stock count for a listing in
the dashboard, the change is durably queued to eBay via an outbox row, the
push task calls eBay's `ReviseInventoryStatus`, and the next pull cycle
confirms the row when eBay echoes the new value back.

## Scope

| Entity | Actions in this PR | Deferred |
|---|---|---|
| `listing` | `updatePrice`, `updateQuantity` | broader `reviseListing` (title/description/specifics) |
| `listingVariant` | — | `updateVariantPrice`, `updateVariantQuantity` |
| `order` | — | `cancelOrder`, `refundOrder`, etc. |

The deferred items don't block the PR — they reuse the same push task,
fingerprint helpers, and confirmation logic, just with different payload
shapes.

## Why price + quantity first

- Both have a single-field payload → trivial fingerprints.
- eBay's `ReviseInventoryStatus` handles both in one API surface and tolerates
  bulk calls (up to 4 SKUs per request) — useful headroom later.
- Most-frequent seller mutation: stock decrements as you sell on other
  channels, and price changes for promotions / repricing.
- Low blast radius: a botched title is visible; a botched price is observable
  but recoverable via retry/cancel through the existing tRPC mutations.

## Audit of what exists

| Piece | State |
|---|---|
| `sync_outbox` schema | ✅ already supports `entityType: 'listing'` |
| State-machine helpers (`claim`/`reconcile`/`send`/`confirm` etc.) | ✅ generic, no entity-specific code |
| `getProtectedEntityIds("listing", ids)` query | ✅ works (just hasn't been called) |
| `confirmOutboxRow(id, snapshot)` | ✅ generic |
| Pull-protection in `upsertListings` | ❌ not wired |
| Push task for listings | ❌ does not exist |
| Listing fingerprint helpers | ❌ does not exist |
| tRPC mutations creating outbox rows | ❌ listing routes write straight to DB |

So infrastructure is reusable; we're adding entity-specific pieces only.

## Parts

- **Part 1 — Actions and payloads** (`01-actions.md`)
  Concrete payload shapes, fingerprint formulas, action constants.
- **Part 2 — Push task** (`02-push-task.md`)
  `sync-listing-update` Trigger.dev task, dispatching on `action`.
- **Part 3 — Pull protection** (`03-pull-protection.md`)
  Field-level CASE WHEN in `upsertListings` for `price` and `quantity`.
- **Part 4 — Confirmation** (`04-confirmation.md`)
  Compare incoming pull values to outbox payload, call `confirmOutboxRow`.
- **Part 5 — tRPC mutations** (`05-trpc-mutations.md`)
  `listing.updatePrice`, `listing.updateQuantity` — outbox-aware writes.
- **Part 6 — Follow-ups** (`06-followups.md`)
  Variant-level, full revisions, order-level actions.
- **Part 7 — Testing** (`07-testing.md`)
  Acceptance matrix.

## Execution order

Internally sequential. Same wave model as `pull-push-sync`:

```
Part 1 ──► Part 2 ──► Part 3 ──► Part 4 ──► Part 5 ──► Part 7
                                                ▲
                                                │ (Part 6 only sketches; not built)
```

Parts 3 + 4 touch the same file (`upsertListings`) so they ship together.

## Out of scope

- eBay platform notifications / webhook (still its own follow-up — see
  `.plan/trigger-cron-sync/04-followup-ebay-webhook.md`).
- Bulk mutations (multi-SKU `ReviseInventoryStatus`). The eBay API supports
  it, but bulking is a perf optimisation, not a correctness need; a single
  outbox row → single API call is fine for v1.
- UI for retry / cancel on conflict. The tRPC mutations exist already
  (`packages/trpc/src/routers/sync.ts`); UI is a frontend task tracked
  elsewhere.
