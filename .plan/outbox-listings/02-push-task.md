# Part 2 — Push task: `sync-listing-update`

## Scope

A new Trigger.dev task at `packages/trigger/src/workflows/sync-listing-update/index.ts`
that walks the standard outbox state machine for listing-level mutations.

## Algorithm

Identical pattern to `sync-shipment` — only the API call and the matching
predicate differ.

1. `claimOutboxRow(outboxId)` — `pending → claimed`.
2. Load channel + tokens via `TokenManager.loadForChannel`.
3. Fetch the listing's current remote state to short-circuit replays:
   `apiClient.getListing(listing.reference)` (new adapter method, **see §
   Adapter additions** below).
4. `startReconciliation(outboxId)` — `claimed → reconciling`.
5. **Reconciliation check**: if the listing's current value already equals
   the outbox payload (e.g. a previous push got through but our row never
   confirmed) → `adoptRemoteObject(outboxId, listing.reference, snapshot)`
   and exit. This is the equivalent of the shipment "fulfillment already
   exists" branch.
6. `markSending(outboxId)` — `reconciling → sending`.
7. Call eBay:
   - `updateListingPrice` → `ReviseInventoryStatus({ ItemID, StartPrice })`.
   - `updateListingQuantity` → `ReviseInventoryStatus({ ItemID, Quantity })`.
   Both via a single new adapter method `apiClient.reviseListingInventory`.
8. `markAwaitingConfirmation(outboxId, externalRef = ItemID)` —
   `sending → awaiting_confirmation`.
9. Confirmation happens during the next pull (Part 4); this task does not
   self-confirm.

## Error matrix

Same classifier (`classifyApiError`) as `sync-shipment`. Behaviour:

| Class | eBay status | Action |
|---|---|---|
| auth | 401 | refresh token via `TokenManager`, retry once, then `failOutboxRow` |
| permanent | 400 / 422 / eBay short-message indicating bad input | `failOutboxRow(outboxId, error)` |
| retryable | 429 / timeout / network | re-throw → Trigger.dev retries |

eBay-specific permanent failures worth surfacing in the error string:

- `21916799` "ItemID is invalid" — listing was ended remotely; the local row
  is stale and should be rejected, not retried.
- `21916013` "Cannot revise an ended listing" — same root cause.

## Adapter additions

`packages/marketplace/src/adapters/base.ts`:

```ts
getListing(reference: string): Promise<Listing>;
reviseListingInventory(
  reference: string,
  patch: { priceMinor?: number; currency?: string; quantity?: number }
): Promise<{ externalRef: string }>;
```

Implementations in `packages/marketplace/src/adapters/ebay/api/`:

- `get-listing.ts` — wraps `client.trading.GetItem({ ItemID })` + existing
  `mapListing`. Reuses the same code path the GetSellerEvents path uses.
- `revise-listing-inventory.ts` — wraps `ReviseInventoryStatus`. Converts
  `priceMinor` (cents) ↔ eBay's decimal `StartPrice` at the boundary.

## Concurrency

Reuse the same shape as the shipment queue — one Trigger.dev queue with a
small concurrency cap and `concurrencyKey: outboxRow.entityId` so two updates
for the same listing serialise. Different listings can run in parallel.

```ts
const listingUpdateQueue = queue({
  name: "sync-listing-update",
  concurrencyLimit: 5,
});
```

## Side effect on local DB

When the push reaches `awaiting_confirmation`, the local `listing` row is
**not** rewritten — the user's optimistic write from Part 5 already set it.
No additional local mutation here.

If reconciliation in step 5 finds the value already matched remotely (rare
race), we still call `adoptRemoteObject`, which lands the row in `confirmed`
without any further DB mutation.

## Acceptance

- [ ] Task ID `sync-listing-update`, registered in `packages/trigger/src/index.ts`.
- [ ] Walks `pending → claimed → reconciling → (confirmed | sending →
      awaiting_confirmation)`.
- [ ] Reconciliation short-circuits when remote state already matches.
- [ ] Auth errors trigger one token refresh + retry, then fail.
- [ ] `concurrencyKey` is the listing's internal ID, not the eBay ItemID.
