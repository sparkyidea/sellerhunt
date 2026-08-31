# Sync outbox guide

Detailed walkthrough of how local mutations are durably propagated to
marketplaces (eBay today; pattern is adapter-agnostic).

If you're new to the codebase, read this end-to-end. If you're extending
the outbox to cover a new (entity, action) pair, also read
[`../../.plan/outbox-listings/`](../../.plan/outbox-listings/) for a worked example (in flight).

---

## Why an outbox

When a seller acts in the dashboard ("ship this order", "drop this price",
"adjust stock"), two systems need to agree: our DB and the marketplace.
Two naive approaches both fail in production:

- **Call the marketplace synchronously inside the request.** Network blip →
  user sees error and retries → duplicate fulfillment. Marketplace timeout
  → ambiguous state, no easy recovery.
- **Write locally, fire-and-forget a background call.** Cron pulls the
  remote state ten minutes later, sees the marketplace hasn't caught up,
  and silently overwrites the user's local edit.

The outbox is the standard fix: every local mutation that needs to
propagate to a marketplace is recorded in a row in `sync_outbox` (in the
**same DB transaction** as the local write). A separate background task
walks that row through a state machine — calling the marketplace, watching
for confirmation, surfacing failures. The pull cron knows about in-flight
rows and refuses to overwrite local fields while a push is in progress.

The result: local writes are durable, the user sees them immediately, the
marketplace eventually catches up, and pull/push never stomp each other.

---

## Anatomy

### Schema

`packages/db/src/schema/sync-outbox.ts`. Every row identifies one
mutation:

| Column | Meaning |
|---|---|
| `id` | uuid primary key |
| `userId`, `channelId` | scope; channel determines which marketplace adapter to use |
| `entityType` | `'order' \| 'listing' \| 'listingVariant'` |
| `entityId` | uuid of the local entity (e.g. `order.id`) |
| `action` | the mutation to perform (e.g. `createShipment`, `updateListingPrice`) |
| `payload` | jsonb — action-specific arguments (tracking number, target price, etc.) |
| `sourceId` | uuid of the local record that triggered the row (e.g. `shipment.id`) — optional |
| `correlationMethod` | how this push was matched to its remote counterpart: `remote_id` \| `client_reference` \| `tracking_match` \| `manual_link` \| null. See [ADR 0003](../decisions/0003-explicit-fulfillment-correlation.md). |
| `status` | state-machine position (see below) |
| `attempts` | retry counter |
| `error` | last error message when in `failed`/`conflict` |
| `externalRef` | marketplace-assigned id once the push succeeds (e.g. eBay fulfillment ID) |
| `remoteSnapshot` | jsonb — state we observed remotely during reconciliation/confirmation, for audit + the conflict UI |
| `pushedAt`, `confirmedAt`, `reconciledAt` | timestamps for state transitions |
| `idempotencyKey` | optional — used when the push call itself supports an idempotency token |

**Removed in the fulfillment-correlation rework (shipped):** the
`fingerprint` column (sha256 content hash). Reconciliation now uses a
priority ladder — `remote_id` → `client_reference` → `tracking_match` →
`manual_link`. See [ADR 0003](../decisions/0003-explicit-fulfillment-correlation.md)
for the reasoning and [`../fulfillment/concepts.md`](../fulfillment/concepts.md)
for the invariants. **Some sections below still describe the legacy
fingerprint flow — read those as historical.**

### Two crucial indexes

```sql
-- "entity blocker": only one unresolved row per (entityType, entityId)
CREATE UNIQUE INDEX sync_outbox_entity_blocker_idx
  ON sync_outbox (entity_type, entity_id)
  WHERE status NOT IN ('confirmed', 'canceled');

-- "in-flight lookup": fast filter for pull protection
CREATE INDEX sync_outbox_in_flight_idx
  ON sync_outbox (entity_type, entity_id, status)
  WHERE status IN
    ('pending', 'claimed', 'reconciling', 'sending', 'awaiting_confirmation');
```

The blocker is **load-bearing**: it's how concurrent mutations on the same
entity are serialized. If a user fires two consecutive "update price"
calls before the first lands, the second insert violates the index and
Postgres throws `23505`. The tRPC layer catches that and returns
`CONFLICT`.

---

## State machine

Nine statuses; five are "in-flight", four are terminal.

```
                       claim
   ┌────────► pending ─────────► claimed
   │            │                    │
   │            │  cancel            │ start reconciliation
   │            ▼                    ▼
   │         canceled         reconciling ────────────┐
   │                                │                  │ adopt
   │                                │ markSending      │ remote
   │                                ▼                  │ already
   │                             sending               │ matched
   │                                │                  │
   │                                │ markAwaiting     │
   │                                ▼                  │
   │     fail   ◄─────  awaiting_confirmation          │
   │              ─►            │                      │
   │                            │ confirm              │
   │                            ▼                      ▼
   │                       confirmed ◄─────────────────┘
   │
   ▼
 failed ──── retry ────► pending
```

| Status | Meaning | In-flight? |
|---|---|---|
| `pending` | created, queued for pickup | ✅ |
| `claimed` | a Trigger.dev task has it | ✅ |
| `reconciling` | checking remote state to avoid duplicates | ✅ |
| `sending` | actively calling the marketplace API | ✅ |
| `awaiting_confirmation` | API call returned ok, waiting for next pull to verify | ✅ |
| `confirmed` | remote state matches our intent — done | terminal |
| `canceled` | user-cancelled before completion | terminal |
| `failed` | terminal-class error from marketplace; user can retry | terminal |
| `conflict` | divergence detected (e.g. push succeeded but later state diverged); needs human resolution | terminal |

Every transition is one atomic SQL update keyed on the expected previous
status, e.g.:

```sql
UPDATE sync_outbox
SET status = 'claimed', attempts = attempts + 1, updated_at = NOW()
WHERE id = $1 AND status = 'pending';
```

If zero rows match (someone else already claimed, or the row was
canceled), the helper throws `OutboxTransitionError`. This makes races
visible at the database boundary instead of silently losing work.

Helpers live in `packages/sync/src/outbox/fenced.ts` —
`claimOutboxRow`, `startReconciliation`, `markSending`,
`markAwaitingConfirmation`, `confirmOutboxRow`, `adoptRemoteObject`,
`failOutboxRow`, `markConflict`, plus the recovery/reset family
(`sweepSendingTimeouts`, `listRecoverableRows`, `claimRecovery`,
`resolveRecovery`, `resetStaleClaims`, `redispatchFailedRow`).

---

## The four-piece pattern

Every supported (entity, action) pair needs four pieces wired up. Missing
any one of them means a silent data hazard.

### 1. The push task

A BullMQ job that owns the lifecycle of one outbox row. It walks the
state machine, calls the marketplace, and either lands in
`awaiting_confirmation` (happy path), `confirmed` (reconciliation found
remote state already matches), or `failed`.

Today: core in `packages/sync/src/shipments/push-shipment.ts`, run by the
`sync-shipment` processor in `apps/worker/src/processors/shipments.ts`. The
listings push task is planned at `.plan/outbox-listings/02-push-task.md`.

The shape every push task must follow:

```ts
1. claimOutboxRow(id)                  // pending → claimed
2. fetch remote state                  // adapter call, no DB writes
3. startReconciliation(id)             // claimed → reconciling
4. if remote already matches fingerprint:
     adoptRemoteObject(id, externalRef, snapshot)   // → confirmed, exit
5. markSending(id)                     // reconciling → sending
6. call marketplace API
7. on auth error: refresh token, retry once
   on permanent error: failOutboxRow(id, error), exit
   on retryable error: re-throw → Trigger.dev retries
8. markAwaitingConfirmation(id, externalRef)   // sending → awaiting_confirmation
```

Notice: the push task **never** transitions to `confirmed` directly. That's
the pull's job (piece 4). The push task only proves "we successfully sent
the call". Confirmation requires observing the marketplace's converged
state.

### 2. The fingerprint

A stable hash of `(entityId, action, payload)` (or whatever
action-specific fields are load-bearing) that lets the pull-side compare
local intent to remote state without false positives.

Lives in `packages/sync/src/outbox/reconciliation.ts`. Existing helpers:
`buildShipmentRemoteSnapshot` / `findMatchingFulfillment`.

Fingerprints serve two purposes:

- **Reconciliation during push**: before calling the marketplace, the
  push task fetches current remote state. If a remote object with the
  same fingerprint already exists (e.g. a network blip retried our call
  and the previous attempt actually succeeded), we adopt it instead of
  creating a duplicate.
- **Confirmation during pull**: when pull sees remote state that matches
  the fingerprint, the outbox row is confirmed.

Two rows for the same listing-id with the same target value still get
distinct fingerprints because `entityId` is folded into the hash —
prevents one row's confirmation from accidentally confirming another's.

### 3. Pull protection

When pulling fresh state from the marketplace, we *cannot* overwrite
fields that an in-flight outbox row is mid-flight on. Otherwise: user
ships order #42 → outbox enqueues `createShipment` → cron tick fires
before the push lands → cron sees `shipped: false` from eBay and stomps
local `shipped: true`.

Implementation lives at the upsert layer, not the pull-fetch layer.
`packages/sync/src/orders/upsert-orders.ts`:

```ts
// Once per batch: which entityIds have an in-flight outbox row?
const protectedOrderIds = await getProtectedEntityIds("order", existingOrderIds);

// In ON CONFLICT DO UPDATE, wrap protected fields in a CASE WHEN:
status:    sql`CASE WHEN "order".id = ANY(${protectedArray})
                 THEN "order".status ELSE EXCLUDED.status END`,
shipped:   sql`CASE WHEN ... THEN "order".shipped ELSE EXCLUDED.shipped END`,
shippedAt: sql`CASE WHEN ... THEN "order".shipped_at ELSE EXCLUDED.shipped_at END`,
// other fields update normally
```

Field-level granularity matters: even when an order is protected, the
buyer's address or a delivery confirmation should still update. Only the
fields the in-flight action could plausibly have just written are
protected.

`getProtectedEntityIds` (in
`packages/sync/src/outbox/protection.ts`) is one batched query for
the whole pull — never N+1.

### 4. Confirmation

The pull side closes the loop. Whenever pull observes the marketplace
state has converged to what the outbox row asked for, atomically:
`awaiting_confirmation → confirmed` and persist `remoteSnapshot` in the
same UPDATE.

For shipments, this requires an extra `getFulfillments(orderRef)` call
per protected order because eBay returns fulfillments on a separate
endpoint. See `captureRemoteEvidence` in
`packages/sync/src/outbox/order-ports.ts`, wired into both order
processors by `createOrdersUpsertPorts`.

For listings, no extra call is needed — `Listing` already carries price
and quantity inline, so confirmation is a memory comparison (planned at
`.plan/outbox-listings/04-confirmation.md`).

The `confirmOutboxRow(id, snapshot?)` helper takes an optional snapshot
so the confirmation and the snapshot write share one round-trip.

If the row's status raced (e.g. conflict-escalation cron flipped it to
`conflict` between read and write), `confirmOutboxRow` throws — catch and
fall back to a snapshot-only update. Defensive but rare.

---

## Worked example: order shipment

End-to-end timeline of a "user shipped an order" flow.

```
T+0   User clicks "Mark as shipped" in the dashboard.
      tRPC: shipment.create({ orderId, tracking, carrier, lineItems })
      DB transaction:
        - INSERT shipment row + shipment_line rows
        - INSERT sync_outbox row:
            entityType: 'order'
            entityId:   <order.id>
            action:     'createShipment'
            payload:    { tracking, carrier, lineItems }
            fingerprint: sha256(...)
            status:     'pending'
            sourceId:   <shipment.id>
        - tasks.trigger("sync-shipment", { outboxId })  -- after commit

T+1s  sync-shipment task picks up the row.
        claimOutboxRow → status = claimed
      Loads channel + tokens.

T+2s    apiClient.getFulfillments(orderRef)  -- check for duplicates
        startReconciliation → status = reconciling
      No matching fingerprint in remote fulfillments.
        markSending → status = sending
        apiClient.createFulfillment(orderRef, payload)
      eBay returns fulfillmentId.
        markAwaitingConfirmation(id, fulfillmentId) → status = awaiting_confirmation
        Local: UPDATE shipment SET reference=fulfillmentId, status='shipped'

T+1m  Meanwhile, sync-channels-scheduler fires its 15-min cron tick.
      pullOrders: fetches recent orders.
      upsertOrders:
        - existingOrderIds includes #42
        - getProtectedEntityIds("order", [#42, ...])
            → returns Set { #42 }   (because of the in-flight row above)
        - upsertOrderRows uses CASE WHEN to skip protected fields on #42
        - captureRemoteEvidence([#42], ...):
            * apiClient.getFulfillments("ebay-order-ref")
            * findMatchingFulfillment(row.fingerprint, remoteFulfillments) → matched
            * row.status === 'awaiting_confirmation' && matched
            * confirmOutboxRow(row.id, snapshot)
            * status = confirmed, confirmedAt set, remoteSnapshot stored

T+15m Done. The order is fully reconciled. Future cron ticks ignore this
      row entirely (it's terminal). Pull protection is no longer applied
      for this order.
```

Failure modes from this same flow:

- **eBay returns 400 "invalid line item"**: classified as permanent →
  `failOutboxRow(id, error)` → status = `failed`. User sees the failure
  in the UI, can call `sync.retryOutboxRow` (transitions to `pending`)
  or `sync.cancelOutboxRow` (transitions to `canceled`).
- **eBay returns 429**: classified as retryable → re-thrown → Trigger.dev
  retries with exponential backoff. Row stays in `sending` between
  attempts.
- **Push reaches `awaiting_confirmation`, but eBay never echoes the
  fulfillment back** (lost in eBay's pipeline): the
  `outbox-conflict-escalation` cron flips it to `conflict` after 1 hour.
- **Process crashes mid-flight** (pod killed during `claimed`): the
  `outbox-stale-reset` scheduler resets rows stuck in `claimed`/
  `reconciling` for >15 minutes back to `pending` (generation bumped);
  stuck `sending` rows go through `outbox-sending-sweep` →
  `reconciliation_required` → the durable `recover-outbox` path instead,
  because a timed-out send may have reached the marketplace.

---

## Lifecycle schedulers

BullMQ schedulers on the worker's `sync-control` queue keep the table
healthy (cores in `apps/worker/src/control/dispatchers.ts`; cadences in
`apps/worker/OPERATIONS.md`):

| Scheduler | Cadence | Job |
|---|---|---|
| `drain-sync-outbox` | 1 min | enqueues `sync-shipment` for `pending` rows (durable fallback for a failed post-commit enqueue) |
| `dispatch-outbox-recovery` | 1 min | dispatches ownerless `reconciliation_required` rows to `recover-outbox` |
| `outbox-stale-reset` | 5 min | `claimed`/`reconciling` untouched >15 min → `pending`, generation bumped |
| `outbox-sending-sweep` | 5 min | `sending` untouched >10 min → `reconciliation_required`, owner cleared |
| `outbox-conflict-escalation` | 15 min | `awaiting_confirmation` rows >1h old → `conflict` |
| `outbox-cleanup` | 1 h | prunes old terminal rows |

Conflict-escalation is the safety net for "marketplace silently dropped
our call" — the push reached `awaiting_confirmation` but the pull never
observed convergence. After the threshold elapses, the row is escalated
to `conflict` and the user can decide.

---

## User-facing operations

`packages/trpc/src/routers/sync.ts` exposes two mutations:

- `sync.retryOutboxRow({ outboxId })` — `failed → pending` and re-trigger
  the push task. Increments `attempts`, clears `error`. Validates user
  ownership.
- `sync.cancelOutboxRow({ outboxId })` — any non-terminal status →
  `canceled`. The push task, if running, will fail the next state-machine
  call with `OutboxTransitionError` and exit cleanly.

There is no UI yet. When listings write-back ships
(`.plan/outbox-listings/`), a conflict drawer will surface the
local-vs-remote diff and offer retry/cancel buttons.

---

## Extending the outbox to a new (entity, action) pair

Concrete checklist when adding a new write-back:

1. **Pick an action name.** Camel-case, verb-first, action-specific (not
   "update"). Good: `createShipment`, `updateListingPrice`. Bad:
   `update`.
2. **Define the payload type.** Always store absolute target values (not
   deltas) so re-running the action is idempotent. Stick the type next to
   the action constant in the same file the push task imports from.
3. **Write a fingerprint helper** in
   `packages/sync/src/outbox/reconciliation.ts`. Sort-key JSON →
   sha256. Include `entityId` so cross-row matching is impossible.
4. **Build the push core** under `packages/sync/src/<domain>/` and its
   processor in `apps/worker/src/processors/`. Follow the eight-step
   skeleton above. Register the job contract in `packages/job-client`.
5. **Add adapter methods** in `packages/marketplace/src/adapters/base.ts`
   and the per-marketplace folders. Two are typical: a "fetch remote
   state" call for reconciliation, and the "do the write" call.
6. **Wire pull protection** into the relevant `pull-*/upsert.ts` —
   field-level CASE WHEN on the columns the action mutates.
7. **Wire confirmation** into the same upsert — match against the
   freshly-pulled state, call `confirmOutboxRow(id, snapshot)`.
8. **Add the tRPC mutation** that inserts the outbox row in the same
   transaction as the local optimistic write, then triggers the push
   task. Catch `23505` on the entity-blocker index and re-throw as
   `CONFLICT`.
9. **Tests** — unit-test the fingerprint and matcher; integration-test
   the tRPC mutation, pull protection, and confirmation; sandbox-test the
   push task end-to-end.

The shipment flow is the canonical example. The
`.plan/outbox-listings/` folder steps through the next worked example
(price + quantity write-back) — same skeleton, different payloads.

---

## Common pitfalls

- **Don't trigger the push task before the transaction commits.** Use
  the post-commit hook pattern (or simply call `tasks.trigger(...)` after
  `await db.transaction(...)` returns). Otherwise the task will pick up a
  row that doesn't exist yet.
- **Don't put the push call inside the transaction.** External I/O in a
  DB transaction holds row locks for an unpredictable duration and
  spreads marketplace flakiness into local writes.
- **Don't silently retry permanent errors.** If eBay says "invalid line
  item", retrying won't help. Classify and `failOutboxRow` for permanent
  failures; let Trigger.dev handle 429 / network / timeout retries.
- **Don't read the row to decide what to do, then update without the
  status guard.** Always use the WHERE-status pattern in
  `sync-outbox.ts` so concurrent transitions surface as
  `OutboxTransitionError` instead of silent overwrites.
- **Don't broaden pull-protection fields beyond what the action
  mutates.** The longer the protected list, the more reliant we are on
  conflict-escalation as a backstop. Today: shipments protect
  `status`/`shipped`/`shippedAt` only. Listings will add `price` /
  `currency` / `availableQuantity`. Resist the urge to protect "the
  whole row".
- **Don't use deltas in payloads.** "Decrement quantity by 5" replayed
  twice is wrong. "Set quantity to 17" replayed twice is fine.
- **Don't call the marketplace inside `pullOrders`/`pullListings` for
  any reason other than confirmation.** Mixing pull and push call paths
  makes failure modes opaque.

---

## File map

| Concern | File |
|---|---|
| Schema | `packages/db/src/schema/sync-outbox.ts` |
| State-machine helpers | `packages/sync/src/outbox/fenced.ts` |
| Pull-protection query | `packages/sync/src/outbox/protection.ts` |
| Fingerprint + reconciliation helpers | `packages/sync/src/outbox/reconciliation.ts` |
| Shipment push core + processor | `packages/sync/src/shipments/push-shipment.ts`, `apps/worker/src/processors/shipments.ts` |
| Pull-protection + confirmation (orders) | `packages/sync/src/orders/upsert-orders.ts` |
| Lifecycle scheduler cores | `apps/worker/src/control/dispatchers.ts` |
| User-facing tRPC | `packages/trpc/src/routers/sync.ts` |
| Caller (shipment creation) | `packages/trpc/src/routers/shipment.ts` |
| Adapter contract | `packages/marketplace/src/adapters/base.ts` |
| eBay implementations | `packages/marketplace/src/adapters/ebay/api/` |
