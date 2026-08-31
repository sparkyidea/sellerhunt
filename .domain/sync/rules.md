# Sync rules

The write path to marketplaces and the ordering constraints on the read path.

---

### SYN-001 — Every marketplace write goes through the outbox

```yaml
id: SYN-001
severity: critical
status: enforced
adr: 0002
code:
  - packages/sync/src/outbox/fenced.ts
  - packages/sync/src/outbox/order-ports.ts
tests:
  - packages/sync/src/outbox/__tests__/fenced.integration.test.ts
```

**Rule.** No code path calls a marketplace mutation API directly. Local
mutations write a `sync_outbox` row in the same transaction as the local change;
a worker drains it.

**Why.** A synchronous marketplace call inside a request produces duplicate
fulfillments on retry after a network blip, and ambiguous unrecoverable state on
timeout. This is the failure that motivated the whole design.

**Violating looks like.** An adapter `createFulfillment` / `updateListing` call
inside a tRPC mutation or request handler. A "just this once, it's a simple
update" exception.

---

### SYN-002 — A push is confirmed by observation, not by response

```yaml
id: SYN-002
severity: critical
status: enforced
adr: 0002
code:
  - packages/sync/src/outbox/reconciliation.ts
tests:
  - packages/sync/src/outbox/__tests__/order-ports.integration.test.ts
```

**Rule.** `sending` → `awaiting_confirmation` → `confirmed` are distinct states.
A row reaches `confirmed` only when a subsequent pull observes the remote state
we intended — never because the HTTP call returned 2xx.

**Why.** Marketplaces accept requests they later reject, and responses get lost
while the write succeeds. "Sent" and "applied" are different facts; collapsing
them produces silent drift that surfaces as a customer complaint.

**Violating looks like.** Marking an outbox row `confirmed` in the push task's
success branch. Skipping `awaiting_confirmation` for an action "because the API
is synchronous."

---

### SYN-003 — The pull side must not stomp in-flight local edits

```yaml
id: SYN-003
severity: critical
status: enforced
adr: 0002
code:
  - packages/sync/src/outbox/protection.ts
tests:
  - packages/sync/src/outbox/__tests__/order-ports.integration.test.ts
```

**Rule.** Before writing marketplace state onto a local record, the pull path
reads in-flight outbox rows for that record and declines to overwrite fields a
pending push owns.

**Why.** Without it, a pull scheduled between "user edits price" and "push
lands" reverts the user's edit to the stale marketplace value, and the user
watches their change undo itself.

**Violating looks like.** A new pull/upsert path that writes fields without
consulting protection. Adding an entity to sync without extending the protected
field set.

---

### SYN-004 — Extending the outbox requires all four pieces

```yaml
id: SYN-004
severity: critical
status: advisory
adr: 0002
code:
  - packages/sync/src/shipments/push-shipment.ts
tests: []
```

**Rule.** A new `(entity, action)` pair ships with all four: push task,
fingerprint, pull protection, and confirmation. Not three.

**Why.** Each piece prevents a specific failure — skipping any one reintroduces
duplicate writes, lost edits, or silent drift. The set is not a style guide.

**Violating looks like.** A push task merged with "protection to follow." That
follow-up does not get written; see the four months of backlog rot this repo
already survived.

**Not mechanically checked** — the checklist in
[`outbox.md`](outbox.md) is the reviewer's tool. Promote to `enforced` if a
lint rule or integration test can assert the set.

---

### SYN-005 — Listings sync before orders, always

```yaml
id: SYN-005
severity: critical
status: enforced
adr: 0004
code:
  - packages/sync/src/listings/upsert-listings.ts
  - packages/sync/src/orders/sync-channel-orders.ts
tests:
  - packages/sync/src/listings/__tests__/listings.integration.test.ts
  - packages/sync/src/orders/__tests__/upsert-orders.integration.test.ts
```

**Rule.** Channel connect enqueues **listings only**. The listings processor
chains the first orders pull. Orders never run before their channel's listings
have landed.

**Why.** An order line can only resolve `listing_variant_id` if the variant
already exists. Orders arriving first produce permanently unlinked lines — the
exact defect that forced the clean-break wipe.

**Violating looks like.** A connect flow, dispatcher, or webhook path that
enqueues an orders pull for a channel with no listings watermark. Removing the
gate because "webhooks arrive out of order anyway."

---

### SYN-006 — The chained first orders pull uses its own dedup id

```yaml
id: SYN-006
severity: high
status: enforced
adr: 0004
code:
  - apps/worker/src/processors/listings.ts
  - packages/sync/src/orders/sync-channel-orders.ts
tests:
  - packages/sync/src/orders/__tests__/upsert-orders.integration.test.ts
```

**Rule.** The orders pull chained from the listings processor uses a distinct
dedup id (`orders-chain-*`).

**Why.** Sharing the dedup id with the gated orders job lets an already-active
job swallow the chained one, and the channel never gets its first orders pull.
The trade-off — it may run alongside an independent dispatcher or webhook pull —
is harmless, since both are idempotent windowed pulls.

**Violating looks like.** Unifying dedup ids "to prevent duplicate work." The
duplication is deliberate.

---

### SYN-007 — Sync progress lives on `channel_sync_state`, per (channel, domain)

```yaml
id: SYN-007
severity: medium
status: enforced
code:
  - packages/db/src/schema/channel-sync-state.ts
  - packages/sync/src/sync-window.ts
tests:
  - packages/sync/src/listings/__tests__/listings.integration.test.ts
```

**Rule.** Watermark (`syncedAt`), `status`/`error`, and `lastRunAt` live on
`channel_sync_state`, keyed per channel **and domain**. The old
`channel.{syncedAt,syncStatus,syncError}` triple is gone.

**Why.** One channel syncs several domains at different rates and fails at them
independently. A single triple on `channel` cannot represent "listings healthy,
orders failing" — the state that matters most during an incident.

**Violating looks like.** Re-adding sync status columns to `channel`. Reading a
channel-level watermark for a domain-level decision.
