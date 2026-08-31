# Part 7 — Testing

## Unit tests (no DB, no API)

`packages/trigger/src/lib/__tests__/sync-reconciliation.listing.test.ts`

```
computeListingPriceFingerprint:
  - same input → same hash
  - different listingId, same price → different hash
  - same listingId, different priceMinor → different hash

computeListingQuantityFingerprint:
  - same input → same hash
  - different quantity → different hash
  - listingId is part of the input

listingMatchesOutbox:
  - updateListingPrice: matches when priceMinor + currency align
  - updateListingPrice: does not match on currency mismatch
  - updateListingQuantity: matches on availableQuantity equality
  - returns false for unknown actions
```

## Integration: tRPC mutations

Requires DB. Seed a listing on a test channel.

```
listing.updatePrice — happy path:
  1. mutation returns { outboxId }
  2. local listing row has new price
  3. sync_outbox row exists with action=updateListingPrice, status=pending,
     fingerprint non-null

listing.updatePrice — concurrency:
  1. fire mutation A
  2. fire mutation B (different price) before A's outbox row resolves
  3. assert: B throws CONFLICT (TRPCError)
  4. cancel A via sync.cancelOutboxRow
  5. fire B again — succeeds

listing.updatePrice — ownership:
  1. mutation by user X for a listing owned by user Y → NOT_FOUND
```

## Integration: pull protection

Requires DB. Seed a listing with local price = 1500 cents.

```
1. Insert sync_outbox row (status=pending, action=updateListingPrice,
   payload={priceMinor: 1500, currency: "USD"}).
2. Run upsertListings with marketplace data showing price = 999 cents.
3. Assert local listing.price still 1500 (protected).
4. Other fields (title, description) update from marketplace.
5. Flip outbox row to status=confirmed.
6. Run upsertListings again.
7. Assert listing.price now 999 (no longer protected).
```

## Integration: confirmation

```
1. Seed an outbox row in status=awaiting_confirmation, action=
   updateListingPrice, payload={priceMinor: 999, currency: "USD"}.
2. Run upsertListings with marketplace data where price = 999.
3. Assert outbox row is now status=confirmed, confirmedAt set,
   remoteSnapshot.type = "listingState".
4. Repeat with marketplace data showing price = 1500 (mismatch) →
   row stays in awaiting_confirmation, snapshot still written.
```

## Trigger.dev: sync-listing-update

Run against eBay sandbox.

```
Happy path:
  1. Seed outbox row, action=updateListingPrice, payload {priceMinor: 999}.
  2. Trigger sync-listing-update with outboxId.
  3. Assert state transitions: pending → claimed → reconciling → sending
     → awaiting_confirmation.
  4. Assert externalRef = listing.reference.
  5. Hit eBay GetItem — confirm new StartPrice.

Reconciliation adoption:
  1. Set listing's remote price to 999 manually on eBay sandbox.
  2. Seed outbox row with same target.
  3. Trigger task.
  4. Assert state goes directly to confirmed via adoptRemoteObject.
  5. Assert ReviseInventoryStatus was NOT called (verify via test double or
     by observing eBay API logs).

Permanent failure:
  1. Mock ReviseInventoryStatus to throw 400.
  2. Run task.
  3. Assert status = failed, error saved.

Token refresh on 401:
  1. Force token expiry.
  2. Run task.
  3. Assert one auto-refresh, then success or fail-once-then-give-up.
```

## End-to-end smoke test

Manual, against sandbox:

```
1. From the dashboard, change a listing's price.
2. Wait <1 min for sync-listing-update to run.
3. Hit eBay sandbox UI — confirm price updated remotely.
4. Wait for next pull cycle (≤15 min).
5. Inspect the sync_outbox row — should be status=confirmed.
```

## Type check + lint

Same gates as before:

```bash
bun check-types
bun x ultracite check
```

## Priority order

1. Unit tests (fingerprints, matcher) — fast, no infra.
2. Integration: tRPC + pull protection — covers the user-visible surface.
3. Integration: confirmation — closes the loop.
4. Trigger.dev sandbox — proves the end-to-end works.
5. Smoke test — last sanity check before merge.
