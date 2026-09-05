# Scan pipeline — architecture & task contracts

Current scan workflow contracts. Durable scan ownership and further scheduling
capacity work are tracked in [Issue #11](https://github.com/sparkyidea/sellerhunt/issues/11).

## 1. Vocabulary

- **Workflow** — does the real scan work for **one** entity:
  `scan-listings-by-keyword`, `scan-listings-by-seller`.
- **Listing batch leaf** — `scan-listings-by-ids` scans listing detail. It is
  **self-recursive**: handed more ids than `listingScanBatchSize` (K) it fans
  out, `batchTrigger`ing ITSELF one run per `<= K` chunk (launcher role); handed
  `<= K` it scans them inline in a paced loop and returns verdicts (leaf role).
  There is **no** single-listing task — "scan one listing" is a 1-element array.
- **Bulk launcher** — a thin task that takes an **array** and fans it out, one
  run per item. `scan-listings-by-keywords` (→ `scan-listings-by-keyword`) lives
  at the cron boundary. (No `scan-listings-by-sellers` — the cron `batchTrigger`s
  sellers directly. `scan-listings-by-ids` is its own launcher via self-recursion.)
- Convention: **plural = bulk/array**, **singular = one entity**.

All workflows are **marketplace-agnostic** — they take `marketplace` and dispatch the
adapter/bearer pool on it.

## 2. Freshness and launch suppression

All three entity types check `last_scanned_at` against the intervals defined inline
in [scan-crons.ts](../src/workflows/scan/scan-crons.ts) and the matching scan-time
freshness checks. Crons select null timestamps or timestamps at/before the cutoff; scan
execution checks again so queued work and discovery paths skip recently scanned
entities. At the exact cutoff, the entity is eligible. Keyword/seller `forceRefresh`
bypasses only that parent's gate; its listing children still respect listing cooldown.

Fresh listings return a verdict from stored metrics, evaluated against the current
thresholds. Fitting cached verdicts retain seller identity and have `isNew: false`:
parents can complete and promote sellers without another detail fetch, snapshot,
or keyword extraction. The existing paced leaf still loads a persona/client.
Missing rows and stale rows fetch as before. Unpersisted rejects/404s have no stored
cooldown yet. These timestamp checks do not claim concurrent stale work; two runs
that both check before either persists can still fetch the same listing. Durable
ownership remains in Issue #11.

[scan-launch-options.ts](../src/utils/scan-launch-options.ts) owns global keyword/seller
launch keys and their two-hour TTL. All three launch sites share that policy:
keyword bulk launch, cron seller launch, and keyword seller promotion. Identical
entities share a key across parent runs and consecutive cron ticks; JSON-encoded
identity parts keep entity types, marketplaces, and references distinct.

The launch TTL is independent of scan cadence. A completed, incomplete, failed,
canceled, or fresh-skipped run may retain its key for the remaining TTL. Recovery
requires expiry plus the next heartbeat and queue service; the code has no reset
hooks and does not depend on a failed run automatically clearing its key. A fresh
skip can consequently delay a later due scan by the remaining TTL.

This suppresses duplicate launches within the TTL, not indefinitely while a run
is queued or executing. Verify actual queue/wait bounds before increasing cadence;
work that can outlive the window needs stronger parent coordination. Listing-batch
keys would not deduplicate overlapping ID sets, so they are intentionally absent.

## 3. Call graph

```
scan-listings-cron ─► stale listings ─► scan-listings-by-ids (self-fans to <=K runs)
scan-sellers-cron  ─► stale sellers  ─► scan-listings-by-seller (one run per seller)
scan-keywords-cron ─► stale keywords ─► scan-listings-by-keywords ─► scan-listings-by-keyword
(each cron sweeps all enabled marketplaces)

scan-listings-by-ids (self-recursive)
 ├─ if > K ids: batchTrigger ITSELF, one run per <=K chunk   ← fire-and-forget, fast handoff
 └─ if <= K ids: paced inline loop over the ids              ← the actual getListing work

scan-listings-by-keyword
 └─ FOR EACH <=K chunk, one at a time: triggerAndWait ─► scan-listings-by-ids   ← WAITS
        └─ for each fitting verdict, fire-and-forget ─► scan-listings-by-seller ← does NOT wait

scan-listings-by-seller
 └─ awaited wave of <=K chunks ─► scan-listings-by-ids   ← WAITS for whole catalog
```

Workflows call sub-workflows directly; the cron fans its stale-entity batches out.
Awaiting callers (keyword, seller) always pass `<= K` chunks so they hit the leaf
branch and read verdicts back — a `> K` chunk would fan out and return no verdicts.

## 4. Workflow contracts

### 4a. `scan-listings-by-ids` — the listing batch leaf (self-recursive)

Input: `{ marketplace, listingIds: string[], config? }`. Machine `micro`.

**Dispatch on size** (`listingScanBatchSize` = K):

- **`> K` (launcher):** chunk into `<= K` pieces and `batchTrigger` ITSELF, one run
  per chunk, fire-and-forget. Returns `{ mode: "fanned", triggered }` fast. This is
  what the cron orphan-catch hits — it hands the whole stale array and ignores the
  result.
- **`<= K` (leaf):** scan the ids inline (below) and return
  `{ mode: "scanned", verdicts, succeeded, notFound, failed, unfit, aborted }`. Awaiting callers
  pass `<= K` so they always land here.

**Per listing** (`scanOneListing` node):

1. Normalize the ID and check listing freshness. Reuse a stored verdict if fresh;
   otherwise call `getListing` for authoritative detail.
2. Evaluate the condition (`minItemSold`, `minSoldLast24h`, price band) → `fit`.
3. **If it fits:** ensure the seller ROW exists — a **bare** `upsertScanSeller({
   marketplace, reference: sellerReference })`, so the listing's seller FK resolves. It
   does **not** fetch seller stats and does **not** trigger `scanListingsBySeller` (that
   would loop). The bare row's `last_scanned_at` stays null, so the cron's stale-seller
   catch scans it for stats later. Then upsert `scan_listing` + snapshot in one
   insert-on-conflict; `isNew` says whether this scan created the row. **If it
   doesn't fit:** persist nothing.
4. Contribute the verdict — `{ listingId, fit, sellerReference }`, plus `scanListingId`,
   `isNew`, `title`, `categoryPath` when it fit — to the run's `verdicts`.
5. **After the paced loop**, the leaf sends the titles of the listings it *inserted*
   (`isNew`; never rescans) to OpenAI in one call (up to 50 titles per request) and
   links each answer as a `scan_keyword` via `scan_listing.keyword_id`. Never throws;
   skipped when `keyword_llm_enabled = false`. Details in `docs/task-payloads.md`.

**Pacing (load-bearing, anti-detection):** a leaf's `<= K` fetches all leave the SAME
box's pinned IP/persona. The loop is strictly sequential (by design, not a setting) with a
jittered delay (`listingScanDelay{Min,Max}Ms`) between fetches, reproducing today's
per-IP rate. Small K spreads work across more boxes/IPs — that fan-out IS the IP-spread.

**Errors are classified, never thrown for scan failures:**
- **persona-level** (401/403 auth, 429/5xx transient): the IP is throttled or the device
  rejected → stop the batch, route the failure **once**, leave the rest stale for the
  cron to re-pick (likely on a different box). Does **not** throw — a thrown run would
  retry the whole batch immediately on the same bad IP.
- **typed listing-detail 404:** increment `notFound`, a completed negative check for
  this attempt. No verdict, snapshot, deletion, end date, or seller promotion is
  produced. This does not establish permanent removal or persist a negative cache.
- **per-listing unresolved error** (parse / unknown / other endpoint 404): increment
  `failed`, leave that ID stale, and continue without degrading the persona.

The bare `scan_seller` upsert is a DB write, not a task fire — no loop. Only fitting
listings are persisted; `fit` + `sellerReference` are the verdict the keyword uses to
decide seller firing.

### 4b. `scan-listings-by-keyword` — discovery, validates in `<= K` batches, fires sellers progressively

Input: `{ marketplace, keyword, config?, forceRefresh? }`. Queue `concurrencyLimit: 1`.

1. **Freshness self-gate** on `scan_keyword.last_scanned_at`. If fresh → skip.
2. `getKeywordSearch` — paginate `searchListings` to `maxSearchPages`; collect every
   listing id (deduped). We do **not** trust the search card's "X sold" badge.
3. **Validate in `<= K` batches** using one awaited leaf at a time. Count completed
   detail verdicts (including threshold rejects) and listing-detail 404s. Keep
   fitting partial verdicts even if other IDs failed or the leaf aborted. For each
   fitting verdict, await the seller launch handoff with shared global launch
   options; do not wait for seller execution. Only record a seller as fired after
   the handoff succeeds. Failed handoffs keep the keyword incomplete.

> **Why serial chunks, not parallel:** a Trigger.dev run holds only **one waitpoint at
> a time** (see `batch-trigger-and-wait-in-waves.ts`), so a run can't `Promise.all` many
> `triggerAndWait`s. Batching cuts the number of sequential waits from N to ⌈N/K⌉ while
> keeping the one-waitpoint shape; within a chunk the listings are paced on one IP.

4. Advance `last_scanned_at` only after search coverage, every listing batch, and
   every qualifying seller handoff is complete. Search failures retain already
   collected IDs for partial validation. Return `status: "incomplete"` for partial
   work, `"completed"` for full completion, or `"skipped"` when fresh. Both parents
   use one task attempt: unexpected exceptions can fail the run, but do not
   immediately replay the whole tree. Incomplete-domain results are successful
   Trigger.dev runs; inspect their status/metadata rather than only `run.ok`.

### 4c. `scan-listings-by-seller` — full catalog, waits

Input: `{ marketplace, sellerId, config?, forceRefresh? }`. Queue `concurrencyLimit: 1`
(one seller across the whole environment).

1. **Freshness self-gate** on `scan_seller.last_scanned_at` → skip if recently scraped.
2. Required `getSeller` → `upsertScanSeller`. A request failure returns incomplete
   before catalog discovery; stats fetching is not best-effort.
3. `getSellerListings` — paginate to `pagination.totalPages` (whole store; no config
   cap, `MAX_SELLER_PAGES = 1000` is a safety ceiling); collect listing IDs and coverage
   status. A request failure or truncation retains partial IDs but is incomplete.
4. **Awaited** fan-out: chunk the catalog into `<= K`-id pieces and
   `batchTriggerAndWaitInWaves` over `scan-listings-by-ids` (one paced leaf run per
   chunk, each on its own box/IP). The seller run **holds open until its whole catalog
   is scanned**, so with `concurrencyLimit: 1` one seller's store fully finishes before
   the next starts. (Chunk by K, not the 1000 cap — a `> K` chunk would hit the launcher
   branch and the await would settle on the fast fan-out, not on listing completion.)
5. Advance `last_scanned_at` only when catalog coverage and all listing batches are
   complete. An empty fully walked catalog completes; an empty failed catalog does
   not. Return structured `status: "incomplete"` with coverage and batch counters for
   partial work, without throwing for a retry. Successful work returns `"completed"`;
   fresh sellers return `"skipped"`.

[scan-completion.ts](../src/utils/scan-completion.ts) owns the completion rule:
`verdicts.length + notFound + failed` must equal the actual requested count, with
valid nonnegative integer counts, no abort, and no unresolved `failed`. Threshold
rejects already have verdicts and are counted once. Raw input URLs need not match
normalized verdict IDs. Crashed children and unexpected launcher-mode returns are
incomplete; launcher mode is a defensive guard since parents already chunk by K.
The seller also checks coverage and that every requested batch returned a result.

### 4d. Marketplace cron tasks

[scan-crons.ts](../src/workflows/scan/scan-crons.ts) declares three production schedules:
`scan-listings-cron`, `scan-sellers-cron`, and `scan-keywords-cron`. Each runs every
five minutes and selects only its entity type across all enabled `scan_config`
rows. Disabled marketplaces are skipped; one marketplace dispatch failure does
not prevent the others from dispatching. Each cron has its own queue limit of one.
Each uses its entity's batch size from the DB and cooldown from worker code. This heartbeat drains
bounded batches and picks up newly due entities; it is not the repeat interval.

| Entity | Cooldown |
| --- | --- |
| Listing | 6 hours |
| Seller | 24 hours |
| Keyword | 7 days |

These are eligibility intervals, not completion-time guarantees. Batch limits,
queueing, failures and retained global keys can delay scans. Scan launches use the
[priorities below](#4e-scan-run-priority). At the default 50 listings
per five-minute tick, the listing cron can select at most 3,600 listing IDs in six
hours, including repeated selections of work that is still stale.

Declarative schedules and inline cooldowns take effect on Trigger.dev worker
deployment; see [rollout](scan-cron-rollout.md). The schema removes the legacy
database cooldown columns, and inline `config` cannot override these intervals.
The former eBay-only task has been removed. Retire any existing dashboard schedule
for that task when rolling out the replacement. No live schedules are modified by
editing these source files.

### 4e. Scan run priority

Every application scan launch sets Trigger.dev's `priority` option inline:

| Scan work | Priority (seconds) |
| --- | --- |
| Listings, including self-fan-out and keyword/seller listing children | 3600 |
| Sellers, including keyword promotions | 1800 |
| Keywords, including the bulk launcher and its children | 0 |

The values are queue-time offsets: Trigger.dev subtracts the priority from the
enqueue timestamp, favoring listings, then sellers, then keywords when queued at
similar times. Older work can still run first, and running tasks are not preempted.
This is a preference under contention, not a strict sequence. Listing discovery
and listing refreshes have the same priority. The cron ticks themselves have no
specified order.

Existing task queues and concurrency limits remain separate. Every child launch
sets its own priority; it does not inherit its parent's value. Manual or external
launches default to zero unless the caller supplies a priority option. Priority
does not change freshness checks, launch keys, or capacity limits. See Trigger.dev's
[priority contract](https://trigger.dev/docs/runs/priority) and
[queue concurrency contract](https://trigger.dev/docs/queue-concurrency).

## 5. Fire-and-forget vs await (the rule)

| Edge | Mode | Why |
|---|---|---|
| cron → bulk launchers / sellers / `scan-listings-by-ids` | fire-and-forget | orchestration; cron finishes fast |
| keyword → `scan-listings-by-ids` | **await, one `<= K` chunk at a time** | keyword needs the verdicts to pick sellers |
| keyword → `scan-listings-by-seller` | **fire-and-forget** | hand-off; sellers serialize on their own queue |
| seller → `scan-listings-by-ids` | **await (whole catalog, in `<= K` chunks)** | one seller's store must finish before the next |
| `scan-listings-by-ids` launcher → itself | **fire-and-forget** | fan `> K` ids across boxes; cron handoff stays fast |
| leaf branch → anything | (none) | the leaf fires nothing |

## 6. Concurrency and deployed verification

The last documented self-hosted observation was server v4.4.6 without checkpoint
support: waiting parents held their boxes and queue slots. Reverify that behavior
on the deployed server before treating the seller queue's limit of one as strict
whole-catalog serialization. The SDK version alone does not establish server
behavior. Parent task attempts are limited to one; the configured run duration is
one hour. The launch TTL allows another hour for queueing, which must be measured.

Unit tests cover completion/error classification, global key creation, and outgoing
priority options from crons and parent/child orchestration with mocked boundaries.
They do not prove deployed scheduling or parent effects. Controlled deployed checks
must verify incomplete results/timestamps, partial seller promotion, cross-tick
key reuse/expiry, queue/wait bounds, and priority under contention before cadence
activation. Verify that waiting parents leave capacity for their listing children.

Every run stamps `hostname` and `boxName` through `setMachineMetadata()` so the
worker can be identified in the dashboard.

## 7. Current task structure

- **Listing work is batched** — `scan-listings-by-ids` is the one listing task
  (self-recursive launcher + paced leaf); there is no single-listing task. Keyword and
  seller validate in `<= K` chunks (`listingScanBatchSize`), each chunk one paced leaf
  run. This **supersedes** the old `KEYWORD_VALIDATION_WAVE_SIZE = 1` (strict
  one-at-a-time): the keyword now waits ⌈N/K⌉ chunks, paced within each, for IP-spread.
- **Pacing is the anti-detection knob** — within a leaf, strict sequencing
  + jittered `listingScanDelay{Min,Max}Ms` keep the shared-IP burst rate sane. Small K
  spreads fetches across more boxes/IPs. Never `Promise.all` a leaf's fetches.
- **No `scan-listings-by-sellers` launcher** — cron `batchTrigger`s sellers directly.
- All three entities have freshness gates; only keywords and sellers have launch
  idempotency keys. Listing ownership is separate pending work.

### Resolved
- Cron orphan listings route through `scan-listings-by-ids`, which now **self-fans** into
  `<= K` leaf runs (one container scans K listings, not one per listing). The old "keep
  the launcher or fan `scan-listing-by-id` directly?" question is moot — the launcher and
  leaf are the same self-recursive task.
