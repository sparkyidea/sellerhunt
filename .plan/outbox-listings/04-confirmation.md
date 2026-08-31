# Part 4 — Confirmation: pull-time `awaiting_confirmation → confirmed`

## Scope

When `pullListings` observes that a listing's remote price or quantity now
matches the outbox row's payload, atomically transition the row to
`confirmed` (writing `remoteSnapshot` in the same UPDATE — same pattern as
`confirmOutboxRow(id, snapshot)` from Part 2 of the previous PR).

## File

`packages/trigger/src/nodes/pull-listings/upsert.ts`

## Why this is simpler than the shipment confirmation

Shipments needed a separate `getFulfillments` call because eBay returns
fulfillments on a different endpoint than orders. **Listings carry their
own current price and quantity inline** — by the time we're inside
`upsertListings`, the `Listing[]` batch already has everything we need to
match against the outbox payload.

So the confirmation logic is a single in-memory comparison per protected
listing — no extra adapter calls, no per-listing API fan-out.

## Algorithm

For each in-flight outbox row on a protected listing:

```ts
const incoming = listingByEntityId.get(row.entityId);
if (!incoming) continue;

const matched = listingMatchesOutbox(incoming, row);
const snapshot = buildListingRemoteSnapshot(incoming, matched);

if (row.status === "awaiting_confirmation" && matched) {
  await confirmOutboxRow(row.id, snapshot);
} else {
  await writeOutboxSnapshot(row.id, snapshot);
}
```

`listingMatchesOutbox` was defined in Part 1.
`writeOutboxSnapshot` already exists in `pullOrders/upsert.ts` — extract it
to `sync-protection.ts` (or a new `outbox-snapshot.ts`) so both nodes can
import it. Trivial refactor.

## Edge cases

- **Outbox row in `pending` / `claimed` / `reconciling` / `sending`** and
  remote already matches: do *not* call `confirmOutboxRow` (its WHERE clause
  enforces `awaiting_confirmation`). Just write the snapshot. The push task
  will see the match itself and call `adoptRemoteObject`, which is the
  correct transition for those states.
- **Status raced** (e.g. conflict-escalation cron flipped the row to
  `conflict` between the read and the write): `confirmOutboxRow` throws
  `OutboxTransitionError`; catch it and write the snapshot only. Same
  defensive pattern as `pullOrders/upsert.ts`.

## Acceptance

- [ ] Pulling a listing whose remote price equals an `awaiting_confirmation`
      outbox row's payload transitions that row to `confirmed` in one tick.
- [ ] Same for quantity.
- [ ] `remoteSnapshot.type` is `"listingState"` and contains the observed
      price + quantity.
- [ ] Non-matching protected listings still get a snapshot written.
- [ ] No new adapter calls during confirmation — just in-memory comparison.
- [ ] Race against conflict-escalation is caught and falls back to
      snapshot-only.
