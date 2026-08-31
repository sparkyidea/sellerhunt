# Fulfillment rules

See [`concepts.md`](concepts.md) for the model these constrain.

---

### FUL-001 — One tracking number, one shipment, one local order

```yaml
id: FUL-001
severity: critical
status: enforced
adr: 0003
code:
  - packages/db/src/schema/shipment.ts
  - packages/db/src/schema/order.ts
tests:
  - packages/db/src/__tests__/migrations.integration.test.ts
```

**Rule.** The invariant `1 tracking = 1 shipment = 1 (local) order` holds
everywhere. A physical box covering several marketplace orders is modelled as a
synthetic **parent order** the children reference — never as a many-to-many
between shipments and orders.

**Why.** Every correlation, refund, and void path is written against this shape.
A many-to-many forces each of them to special-case merges, and they will not all
special-case it the same way.

**Violating looks like.** A join table between `shipment` and `order`. Two
shipment rows sharing a tracking number.

---

### FUL-002 — Correlation resolves to the merge root before comparing

```yaml
id: FUL-002
severity: critical
status: enforced
adr: 0003
code:
  - packages/sync/src/orders/shipments.ts
  - packages/db/src/schema/order.ts
tests:
  - packages/sync/src/orders/__tests__/upsert-orders.integration.test.ts
```

**Rule.** Compare `order.parentOrderId ?? order.id` on both sides. Never the raw
`orderId`.

**Why.** Child orders in a merge share their shipment via the parent. Comparing
raw ids mismatches **every** merged shipment, which then looks like an
uncorrelated push and escalates to conflict.

**Violating looks like.** Any correlation or dedup predicate reading `orderId`
directly. New code that works in testing because the fixtures have no merges.

---

### FUL-003 — Tracking comparison is normalized and non-empty on both sides

```yaml
id: FUL-003
severity: critical
status: enforced
adr: 0003
code:
  - packages/shipment-tracking/src/utils/normalize-tracking.ts
tests:
  - packages/shipment-tracking/src/adapters/package-tracker/api/mapper/__tests__/map-tracking.test.ts
```

**Rule.** Trim and uppercase before comparing. An empty or null tracking never
matches anything — including another empty tracking.

**Why.** Carriers and marketplaces disagree on case and padding for the same
number. And two shipments that both lack tracking are not the same shipment;
treating empty as equal correlates unrelated pushes to each other.

**Violating looks like.** `a.tracking === b.tracking` without normalization. A
predicate where `null == null` short-circuits to a match.

---

### FUL-004 — `shipment.source` and `sync_outbox.correlationMethod` are separate axes

```yaml
id: FUL-004
severity: high
status: enforced
adr: 0003
code:
  - packages/db/src/schema/shipment.ts
  - packages/db/src/schema/sync-outbox.ts
tests:
  - packages/db/src/__tests__/migrations.integration.test.ts
```

**Rule.** `shipment.source` records **provenance of the row** (`local` |
`marketplace`). `sync_outbox.correlationMethod` records **how one push matched**
its remote counterpart. One axis per column. A marketplace-sourced shipment has
no outbox row and no correlation method — its `source` is the record.

**Why.** Correlation is a per-push event; a merged shipment fans out to N outbox
rows that can each correlate differently. Storing the method on `shipment`
flattens that away and loses per-child fidelity.

**Violating looks like.** Adding a `marketplace_import` value to
`correlationMethod`. Copying the method onto `shipment` "for convenience."
Adding `shipment.remoteSnapshot` — audit lives on the outbox row.

---

### FUL-005 — Correlation follows the priority ladder, and records which rung

```yaml
id: FUL-005
severity: critical
status: enforced
adr: 0003
code:
  - packages/db/src/schema/sync-outbox.ts
  - packages/sync/src/outbox/fenced.ts
  - packages/sync/src/outbox/reconciliation.ts
tests:
  - packages/sync/src/outbox/__tests__/order-ports.integration.test.ts
```

**Rule.** Try in order: `remote_id` → `client_reference` → `tracking_match` →
`manual_link`. Write the rung that succeeded to
`sync_outbox.correlation_method`. If none match, the row stays in a needs-review
state with no method set.

**Why.** The rungs differ in strength — `remote_id` is direct evidence,
`tracking_match` is an inference. Recording which one was used makes silent
degradation queryable: an adapter that quietly stops echoing client references
shows up as a shift in the per-channel method mix, weeks before anyone notices
by hand.

**Violating looks like.** Trying `tracking_match` first because it's the common
case. Leaving `correlation_method` null on a successful correlation.

---

### FUL-006 — Content hashing is never an identity

```yaml
id: FUL-006
severity: critical
status: enforced
adr: 0003
code:
  - packages/sync/src/outbox/reconciliation.ts
tests:
  - packages/sync/src/outbox/__tests__/order-ports.integration.test.ts
```

**Rule.** `sync_outbox.fingerprint` and `computeShipmentFingerprint` are
deleted. Do not reintroduce a content hash as a correlation key.

**Why.** Content hashes fail in both directions: a benign field edit breaks a
real match, and two genuinely distinct shipments with identical content collide.
Identity must come from an identifier, not from a summary of the payload.

**Violating looks like.** A new `hash`/`digest`/`signature` column used to decide
whether a remote record is ours. Note this is distinct from the *deterministic
event reference* hash on `tracking_event`, which is a dedup key within a known
tracking, not a cross-system identity.

---

### FUL-007 — Merges are user-initiated only

```yaml
id: FUL-007
severity: high
status: enforced
adr: 0003
code:
  - packages/sync/src/orders/upsert-orders.ts
tests:
  - packages/sync/src/orders/__tests__/upsert-orders.integration.test.ts
```

**Rule.** `pull-orders` never infers a merge. It does not conclude "two
marketplace orders share a tracking, so they must be merged." Merges happen in
the dashseller UI, initiated by the seller.

**Why.** Shared tracking has innocent causes (carrier reuse after a void, seller
error, marketplace data glitch). An inferred merge restructures order
relationships based on a guess, and unwinding it is manual.

**Violating looks like.** Grouping logic in a pull path. A "smart merge
detection" feature that runs without confirmation.

---

### FUL-008 — `shipment.reference` is display-only

```yaml
id: FUL-008
severity: medium
status: enforced
adr: 0003
code:
  - packages/db/src/schema/shipment.ts
tests:
  - packages/db/src/__tests__/migrations.integration.test.ts
```

**Rule.** The source of truth for per-marketplace-order fulfillment IDs is the
outbox row's `external_ref`. `shipment.reference` is kept for display and
backwards compatibility.

**Why.** A merged shipment has one `reference` but N remote fulfillment IDs.
Reading `reference` as authoritative silently drops all but one child.

**Violating looks like.** A void, refund, or re-push path keyed on
`shipment.reference`.

---

### FUL-009 — Tracking event geo resolves on the write path

```yaml
id: FUL-009
severity: medium
status: enforced
code:
  - packages/sync/src/tracking/upsert-tracking.ts
  - packages/db/src/schema/tracking.ts
tests:
  - packages/shipment-tracking/src/adapters/package-tracker/api/mapper/__tests__/parse-location.test.ts
```

**Rule.** `latitude`/`longitude` are resolved once at ingest and persisted on
`tracking_event` (zip → city+state → state centroid, DB-only). The read path
never geocodes. `location` keeps the raw upstream string verbatim so the
resolver has an input, and is null for synthesized in-transit events.

**Why.** Geocoding per read ran the world tables on every shipment detail load.
The resolution is deterministic, so caching it as a column is strictly better.

**Violating looks like.** A geocode call inside a query resolver or a React
component. Overwriting `location` with the normalized form.

---

### FUL-010 — Tracking event ingest is idempotent by deterministic reference

```yaml
id: FUL-010
severity: high
status: enforced
code:
  - packages/sync/src/tracking/upsert-tracking.ts
tests:
  - packages/shipment-tracking/src/adapters/package-tracker/api/mapper/__tests__/map-tracking.test.ts
```

**Rule.** Events upsert on `(tracking_id, reference)` with
`ON CONFLICT DO NOTHING`, where `reference` is a **deterministic hash** of the
event — not an upstream-supplied event id.

**Why.** Upstream event ids are not stable across polls for every provider, so
re-polling inserted duplicate rows in production while sandbox looked clean. A
deterministic hash makes re-polls no-ops by construction.

**Violating looks like.** Using a provider `eventId` as the reference. Adding a
new tracking source without a deterministic reference derivation.
