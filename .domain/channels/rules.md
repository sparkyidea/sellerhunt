# Channel rules

A **channel** is one seller's connection to one marketplace in one country — the
unit of OAuth, sync state, and webhook subscription. Per-marketplace behaviour
lives in [`ebay.md`](ebay.md) and [`shopify.md`](shopify.md).

---

### CHN-001 — Widening OAuth scopes is a reconnect migration

```yaml
id: CHN-001
severity: critical
status: advisory
code:
  - packages/marketplace/src/adapters/ebay/auth/scopes.ts
  - packages/marketplace/src/adapters/shopify/auth/scopes.ts
tests: []
```

**Rule.** Scopes are pinned in code, never env. Adding one invalidates every
connected channel on that marketplace — the SDK sends the whole list on token
refresh and the marketplace rejects scopes outside the original consent. Batch
additions and plan a reconnect campaign.

**Why.** A one-line scope addition silently breaks sync for every existing
seller at their next token refresh, hours later, with no deploy-time signal.

**Violating looks like.** A scope added alongside an unrelated feature. Scopes
read from env, which lets deployments diverge into "some channels can't sync."

**Not mechanically checked** — the failure happens at a marketplace's token
endpoint hours after deploy, so no local test reproduces it. Enforcement is the
reviewer noticing that `scopes.ts` changed. A CI rule that fails any diff
touching `scopes.ts` without a `CHN-001` reference would promote this to
`enforced`.

---

### CHN-002 — Webhook signature verification must not silently reject

```yaml
id: CHN-002
severity: critical
status: enforced
code:
  - packages/marketplace/src/adapters/ebay/notification/verify-delivery.ts
tests:
  - packages/marketplace/src/adapters/ebay/notification/__tests__/verify-delivery.test.ts
```

**Rule.** The verify call is wrapped in try/catch, so **any** thrown error
becomes "invalid signature" and the notification is dropped. Runtime-specific
crypto spellings must be proven against Bun, not copied from a vendor's Node SDK.

Concretely: eBay's official SDK spells the algorithm `ssl3-sha1`; Bun's
`createVerify` throws on it. `sha1` is the portable spelling and verifies
identically.

**Why.** This failure mode is invisible — no error surfaces, no alert fires,
every genuine notification is simply discarded while the endpoint returns 200.

**Violating looks like.** "Correcting" `sha1` back to `ssl3-sha1` to match vendor
docs. Any crypto identifier introduced without a test that exercises a real
signature under Bun.

---

### CHN-003 — A vanished webhook subscription is not necessarily one we removed

```yaml
id: CHN-003
severity: high
status: enforced
code:
  - packages/marketplace/src/adapters/shopify/notification/subscriptions.ts
  - apps/api/src/lib/channel-webhook.ts
tests:
  - packages/marketplace/src/adapters/shopify/notification/__tests__/subscriptions.test.ts
```

**Rule.** Marketplaces delete subscriptions after repeated delivery failures.
Reconciliation must be able to re-create any subscription it expects, and must
not treat absence as intent.

**Why.** After an outage, every affected channel silently stops receiving
notifications. Without reconciliation that re-creates them, sync degrades to
cron-only and nobody notices.

**Violating looks like.** Reconciliation that only creates subscriptions on
connect. Treating a missing subscription as "the user turned it off."

---

### CHN-004 — Marketplace topic spellings are boundary values, never stored

```yaml
id: CHN-004
severity: medium
status: enforced
code:
  - packages/marketplace/src/adapters/shopify/notification/topics.ts
tests:
  - packages/marketplace/src/adapters/shopify/notification/__tests__/topics.test.ts
```

**Rule.** A marketplace's own topic enum (Shopify's `WebhookSubscriptionTopic`)
exists only at the API boundary. Never persist it, never compare against it
outside the adapter's topics module. The neutral `NotificationEventType` is what
the rest of the system uses.

**Why.** Vendor enums are renamed across API versions. Persisting them makes an
API-version bump a data migration.

**Violating looks like.** A `graphqlTopic` string in a DB column or a tRPC
input. A switch on vendor topic strings outside the adapter.

---

### CHN-005 — Unhandled notification topics are archived, not dropped or dispatched

```yaml
id: CHN-005
severity: medium
status: enforced
code:
  - packages/marketplace/src/adapters/shopify/notification/topics.ts
tests:
  - packages/marketplace/src/adapters/shopify/notification/__tests__/topics.test.ts
```

**Rule.** A topic with no worker handler is archived as `ignored` on arrival. It
does not wake a worker, and it is not discarded silently.

**Why.** Waking a worker for every unhandled topic wastes capacity at
marketplace notification volume; discarding them loses the evidence that a topic
started arriving.

**Violating looks like.** Enqueuing work for every received notification.
Returning 200 without recording the delivery.

---

### CHN-006 — A scope-blocked topic is a property of the install, not a retryable failure

```yaml
id: CHN-006
severity: medium
status: enforced
code:
  - packages/marketplace/src/adapters/shopify/notification/subscriptions.ts
tests:
  - packages/marketplace/src/adapters/shopify/notification/__tests__/subscriptions.test.ts
```

**Rule.** When our access scopes can't hold a topic, record it and stop. Do not
retry, do not escalate, do not alert.

**Why.** It is a permanent property of that install until the seller re-consents
with wider scopes. Retrying burns rate limit and fills the error channel with
noise that hides real failures.

**Violating looks like.** Scope errors entering the generic retry path.

---

### CHN-007 — A marketplace's term never decides which entity it maps to

```yaml
id: CHN-007
severity: critical
status: enforced
code:
  - packages/marketplace/src/adapters/shopify/api/mapper/map-listing.ts
  - packages/marketplace/src/adapters/ebay/api/mapper/map-listing.ts
  - packages/marketplace/src/types.ts
tests:
  - packages/marketplace/src/adapters/ebay/api/mapper/__tests__/map-listing.test.ts
```

**Rule.** Map by meaning, against
[`terminology.md`](terminology.md) — never by matching the vendor's noun to our
same-named entity.

Concretely: **Shopify `Product` → our `listing`**, not our `product`. Shopify
`ProductVariant` → our `listing_variant`. Our `product` has no marketplace
counterpart at all; it is created locally, 1:1 per imported listing.

**Why.** Shopify's Product is scoped to one shop, so it is channel data. Mapping
it to `product` puts channel data in the channel-agnostic catalog and destroys
the cross-channel spine that `product` exists to provide — one physical thing
listed on several channels. The failure is silent: rows land, types check, and
the catalog is quietly wrong.

**Violating looks like.** A new adapter whose `map-product.ts` returns the
neutral `Product` type — nothing should, because no marketplace supplies one.
An adapter mapping a vendor "product" endpoint into `product`. Reaching for the
neutral type whose *name* matches the vendor's.

**Known gap.** `map-listing.ts` on the Shopify side — the adapter where this
false friend actually lives — has **no test**. The cited eBay test covers the
principle but not the risky case. Worth closing.
