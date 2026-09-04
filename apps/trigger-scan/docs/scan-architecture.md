# Scan pipeline — architecture & task contracts

Source-of-truth design for the scan workflows. This is the **agreed target**; the
"Delta from current code" section at the end lists what changes to reach it.

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

## 2. The one check that matters: keyword & seller only

Only **keyword** and **seller** scans are freshness-gated, because each one fans out a
**massive** number of child tasks — skipping a fresh one avoids re-triggering that
whole tree. A **listing** scan is cheap (one `getListing`, then an upsert only if it
fits), so it has **no** freshness gate and **no** idempotency key — we just scan it.

Consequence (accepted): a listing may be scanned more than once (keyword validation,
then again inside its seller's catalog, then maybe the cron orphan catch). That's
fine — listing scans are cheap, and keyword/seller cadence is what's actually gated.

## 3. Call graph

```
ebay-listings-scanner (cron, scheduled)
 ├─ stale keywords ─► scan-listings-by-keywords (bulk) ─► scan-listings-by-keyword
 ├─ stale sellers  ─► scan-listings-by-seller            (batchTrigger, one per seller)
 └─ stale listings ─► scan-listings-by-ids               (orphan catch, self-fans to <=K runs)

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
  `{ mode: "scanned", verdicts, succeeded, failed, unfit, aborted }`. Awaiting callers
  pass `<= K` so they always land here.

**Per listing** (`scanOneListing` node — the former single-leaf pipeline, unchanged):

1. `getListing` (authoritative detail). **No freshness check — always scan.**
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
- **per-listing** (404 / parse / unknown): tally as failed, leave that id stale, keep
  going. Does **not** degrade the persona (a missing listing is not the IP's fault).

The bare `scan_seller` upsert is a DB write, not a task fire — no loop. Only fitting
listings are persisted; `fit` + `sellerReference` are the verdict the keyword uses to
decide seller firing.

### 4b. `scan-listings-by-keyword` — discovery, validates in `<= K` batches, fires sellers progressively

Input: `{ marketplace, keyword, config?, forceRefresh? }`. Queue `concurrencyLimit: 1`.

1. **Freshness self-gate** on `scan_keyword.last_scanned_at`. If fresh → skip.
2. `getKeywordSearch` — paginate `searchListings` to `maxSearchPages`; collect every
   listing id (deduped). We do **not** trust the search card's "X sold" badge.
3. **Validate in `<= K` batches** — chunk the ids and await one leaf run per chunk:

   ```
   for each chunk of <= K listingIds:
     run = await scanListingsByIds.triggerAndWait({ marketplace, listingIds: chunk, config })
     if !run.ok or run.output.mode != "scanned": continue
     for each verdict in run.output.verdicts:
       if verdict.fit and verdict.sellerReference and seller not already fired this run:
         scanListingsBySeller.trigger(           // FIRE-AND-FORGET — do not await
           { marketplace, sellerId: verdict.sellerReference, config },
           { idempotencyKey: ["seller", marketplace, sellerReference],
             idempotencyKeyTTL: `${sellerRescanAfter}m` })
         mark seller fired (in-run Set)
   ```

   **Progressive and serial across chunks**: wait chunk 1 → fire its sellers → wait
   chunk 2 → … The keyword `await`s each **chunk**; it never `await`s a **seller**.

> **Why serial chunks, not parallel:** a Trigger.dev run holds only **one waitpoint at
> a time** (see `batch-trigger-and-wait-in-waves.ts`), so a run can't `Promise.all` many
> `triggerAndWait`s. Batching cuts the number of sequential waits from N to ⌈N/K⌉ while
> keeping the one-waitpoint shape; within a chunk the listings are paced on one IP.

4. `markKeywordScanned` (writes `last_scanned_at = now`) **only after every listing is
   validated and its seller fired** — a crash mid-validation leaves the keyword stale
   for the cron to re-pick. (The cron fires keywords through the `scan-listings-by-keywords`
   launcher, which stamps a per-keyword idempotency key, so a still-running keyword
   isn't re-enqueued each tick.)

### 4c. `scan-listings-by-seller` — full catalog, waits

Input: `{ marketplace, sellerId, config?, forceRefresh? }`. Queue `concurrencyLimit: 1`
(one seller across the whole environment).

1. **Freshness self-gate** on `scan_seller.last_scanned_at` → skip if recently scraped.
2. `getSellerStat` (`getSeller`) → `upsertScanSeller`.
3. `getSellerListings` — paginate to `pagination.totalPages` (whole store; no config
   cap, `MAX_SELLER_PAGES = 1000` is a runaway guard only); collect listing ids.
4. **Awaited** fan-out: chunk the catalog into `<= K`-id pieces and
   `batchTriggerAndWaitInWaves` over `scan-listings-by-ids` (one paced leaf run per
   chunk, each on its own box/IP). The seller run **holds open until its whole catalog
   is scanned**, so with `concurrencyLimit: 1` one seller's store fully finishes before
   the next starts. (Chunk by K, not the 1000 cap — a `> K` chunk would hit the launcher
   branch and the await would settle on the fast fan-out, not on listing completion.)
5. `markSellerScanned` (writes `last_scanned_at = now`) **only after the whole catalog
   has been scanned** — a crash mid-catalog leaves the seller stale for the cron to
   re-pick. The cron stamps a per-seller idempotency key (scoped to the rescan window)
   so it doesn't re-enqueue a still-running seller.

### 4d. `ebay-listings-scanner` — cron heartbeat

Scheduled. Reads `scan_config` (kill switch via `enabled`). Picks stale
keywords/sellers/listings via `pickStale*` (which read `last_scanned_at`), and fans
each batch out fire-and-forget. The resilience net: any dropped fan-out is
re-discovered next tick.

## 5. Fire-and-forget vs await (the rule)

| Edge | Mode | Why |
|---|---|---|
| cron → bulk launchers / sellers / `scan-listings-by-ids` | fire-and-forget | orchestration; cron finishes fast |
| keyword → `scan-listings-by-ids` | **await, one `<= K` chunk at a time** | keyword needs the verdicts to pick sellers |
| keyword → `scan-listings-by-seller` | **fire-and-forget** | hand-off; sellers serialize on their own queue |
| seller → `scan-listings-by-ids` | **await (whole catalog, in `<= K` chunks)** | one seller's store must finish before the next |
| `scan-listings-by-ids` launcher → itself | **fire-and-forget** | fan `> K` ids across boxes; cron handoff stays fast |
| leaf branch → anything | (none) | the leaf fires nothing |

## 6. Concurrency (confirmed — self-hosted holds the slot)

"One seller's whole store before the next" relies on the **seller** run **holding** its
`concurrencyLimit: 1` slot through its `batchTriggerAndWait`. **Confirmed:** this
self-hosted instance (v4.4.6) has **no checkpoint support**, so a waiting parent stays
`EXECUTING_WITH_WAITPOINTS` and **holds its box** for the whole wait — concurrency is
released only inside `createCheckpoint`, which never runs here. So strict seller
serialization works exactly as intended; the cost is just that the seller's `small-1x`
box is occupied (not released) during the wait. (The keyword is unaffected by the
serialization question: it fire-and-forgets sellers, never awaits them — but its own
per-chunk waits likewise hold its `micro` box, which is why batching to ⌈N/K⌉ waits
matters.)

Every run also stamps `hostname` + `boxName` into metadata via `setMachineMetadata()`,
so the dashboard shows which worker ran each task.

## 7. Delta from current code (what this revision changes)

> **Historical** — describes the revision that made the leaf return a verdict. The leaf
> `scan-listing-by-id` has since been folded into the batched `scan-listings-by-ids`
> (see §1, §4a, §8); read the names below as that task's per-listing core (`scanOneListing`).

1. **Leaf** (`scan-listing-by-id`): **remove the freshness self-gate** (always scan),
   **remove `discoverSeller` + `maybePromoteSeller`** (fires nothing), persist only
   when it fits (unchanged), and **return `{ listingId, fit, sellerReference }`**.
2. **Keyword** (`scan-listings-by-keyword`): replace the fire-and-forget fan-out with a
   **serial `triggerAndWait` loop**; after each listing that fits, fire-and-forget
   `scan-listings-by-seller` (deduped in-run + idempotency-keyed).
3. **Drop the listing idempotency key** on the cron's orphan-listing fan-out (listings
   aren't gated anymore).
4. Everything else stays: seller awaited catalog + freshness gate, keyword freshness
   gate, bulk launchers, cron shape, seller idempotency, hostname metadata.

## 8. Locked decisions

- **Listing work is batched** — `scan-listings-by-ids` is the one listing task
  (self-recursive launcher + paced leaf); there is no single-listing task. Keyword and
  seller validate in `<= K` chunks (`listingScanBatchSize`), each chunk one paced leaf
  run. This **supersedes** the old `KEYWORD_VALIDATION_WAVE_SIZE = 1` (strict
  one-at-a-time): the keyword now waits ⌈N/K⌉ chunks, paced within each, for IP-spread.
- **Pacing is the anti-detection knob** — within a leaf, strict sequencing
  + jittered `listingScanDelay{Min,Max}Ms` keep the shared-IP burst rate sane. Small K
  spreads fetches across more boxes/IPs. Never `Promise.all` a leaf's fetches.
- **No `scan-listings-by-sellers` launcher** — cron `batchTrigger`s sellers directly.
- Listings: **no freshness gate, no idempotency** — only keyword & seller are gated.

### Resolved
- Cron orphan listings route through `scan-listings-by-ids`, which now **self-fans** into
  `<= K` leaf runs (one container scans K listings, not one per listing). The old "keep
  the launcher or fan `scan-listing-by-id` directly?" question is moot — the launcher and
  leaf are the same self-recursive task.
