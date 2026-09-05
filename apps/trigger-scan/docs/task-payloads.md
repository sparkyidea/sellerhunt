# Scan task payloads

Reference for triggering the scan pipeline tasks (Trigger.dev v4). All tasks are
**marketplace-agnostic** — pass `marketplace: "ebay" | "shop"` and the adapter +
bearer pool dispatch on that string.

## Pipeline at a glance

Listing detail is scanned by **one** task — `scan-listings-by-ids`, a self-recursive
launcher + paced batch leaf (handed `> K` ids it fans into `<= K` child runs; handed
`<= K` it scans them inline and returns verdicts). There is no single-listing task.

```
scan-cron ─┬─ stale listings → scan-listings-by-ids (self-fans > K IDs into <=K leaf runs)
           ├─ stale sellers  → scan-listings-by-seller → await catalog → scan-listings-by-ids
           └─ stale keywords → scan-listings-by-keywords → scan-listings-by-keyword
                                                           ├─ await → scan-listings-by-ids
                                                           └─ fitting verdict → scan-listings-by-seller
```

- **keyword** validates in `<= K` chunks: it `triggerAndWait`s `scan-listings-by-ids`
  per chunk, reads the verdicts, and fires `scan-listings-by-seller` for each fitting
  listing **the moment its chunk returns** (deduped, fire-and-forget).
- **seller** waves `<= K`-id chunks over `scan-listings-by-ids` as an **awaited** fan-out
  (`concurrencyLimit: 1`), so one seller's whole catalog finishes before the next starts.
- **K** is `scan_config.listingScanBatchSize`; each leaf run paces its `<= K` fetches on
  one box/IP (strictly sequential, jittered `listingScanDelay{Min,Max}Ms`).

You normally only trigger the **cron** (or a **bulk** task for an ad-hoc batch).
The inner tasks are triggered for you, but each is independently triggerable.

## Triggering

```ts
import { tasks } from "@trigger.dev/sdk";

await tasks.trigger("scan-listings-by-keywords", {
  marketplace: "ebay",
  keywords: ["drone", "nintendo switch"],
});
```

Or from the Trigger.dev dashboard → the task → **Test** → paste the JSON payload.

Priority is a Trigger.dev launch option, not a payload field. Application launch
sites set [entity priorities](scan-architecture.md#4e-scan-run-priority) explicitly,
including child runs. Manual/external launches default to zero unless the caller
supplies the option, for example:

```ts
await tasks.trigger(
  "scan-listings-by-ids",
  { marketplace: "ebay", listingIds: ["204413360253"] },
  { priority: 3600 }
);
```

### `config` is optional everywhere

Each scan workflow accepts an optional `config` (`ScanConfig`). **Omit it** and the task
loads the marketplace's row from `scan_config` itself. The cron pre-loads it once
and threads it down so child tasks don't re-query. Only pass it inline to override
the DB tunables for a one-off run. Cooldowns are task constants and cannot be
overridden through `config`. Fields (money in integer cents): `enabled`,
`maxSearchPages` (keyword depth; seller stores are always walked to the end), `minItemSold`,
`minPriceCents`, `maxPriceCents`
(nullable), `minSoldLast24h` (nullable), `keywordBatchSize`, `sellerBatchSize`,
`listingBatchSize` (stale listings picked per cron tick), `listingScanBatchSize` (= K,
listings per leaf run + fan-out threshold), `listingScanDelayMinMs` /
`listingScanDelayMaxMs` (jittered per-fetch pacing), `marketplace`, and
`keywordLlmEnabled` (LLM kill switch, default true). Only kill switches, thresholds and
per-marketplace tuning are config: the LLM model, reasoning effort and titles-per-request
cap are constants in `src/keywords/extract-keywords.ts`, leaf fetches are always
sequential, and the retry tool's page size is a payload option.

---

## Marketplace cron task

`scan-cron` is the one production schedule declared in
[scan-crons.ts](../src/workflows/scan/scan-crons.ts). Each tick loads the enabled
marketplace configs once, then sweeps listings, sellers, and keywords in that order,
selecting stale entities per marketplace and launching the existing workflows.
Marketplaces whose adapter lacks keyword search or seller catalog methods (shop
today) are skipped by those two sweeps and reported as `unsupported`; the keyword
and seller tasks refuse manual launches for them before loading a persona.
Trigger.dev supplies the schedule payload; there is no custom marketplace or config
payload for this task. The run output lists one `{ entity, marketplace, status,
triggered }` entry per sweep and marketplace.

For cadence, cooldown settings and deployment behavior, see
[architecture](scan-architecture.md#4d-marketplace-cron-task) and
[rollout](scan-cron-rollout.md).

---

## `resolve-listing-keywords` (single, manual retry)

Keyword extraction retry tool. The scan extracts keywords itself (see
`scan-listings-by-ids`); this task is for listings that fell through — the switch was
off, the key was missing, an OpenAI batch failed, a leaf died mid-stage. Nothing
triggers it automatically. Picks listings with `keyword_id IS NULL` and fewer than 3
attempts (explicit ids do not bypass the cap), sends their titles to OpenAI in requests
of up to 50 titles and stores the answers as `scan_keyword` rows. Exits without picking
or spending an attempt when `keyword_llm_enabled = false`. Per-listing detail (title,
phrase, status) is in the run logs. Needs `OPENAI_API_KEY`.

```ts
interface ResolveListingKeywordsPayload {
  /** Catch-up mode only: how many unresolved listings to pick (default 200). */
  limit?: number;
  /** scan_listing.id values; `[]` does nothing. Omit the key to catch up on unresolved listings. */
  listingIds?: string[];
  marketplace: string;
}
```

Unlike the scan tasks, no `config` override: the `scan_config` row (LLM switch) is read
fresh on every run.

```jsonc
{ "marketplace": "ebay", "listingIds": ["<scan_listing.id>"] }
```

```jsonc
{ "marketplace": "ebay", "limit": 500 } // catch-up: next 500 unresolved listings with attempts left (default 200)
```

---

## `scan-listings-by-keywords` (bulk)

Fan a list of keywords out to `scan-listings-by-keyword`, fire-and-forget.

```ts
interface ScanListingsByKeywordsPayload {
  marketplace: string;
  keywords: string[];
  config?: ScanConfig;
}
```

```jsonc
{
  "marketplace": "ebay",
  "keywords": ["drone", "lego star wars", "dyson v8"]
}
```

---

## `scan-listings-by-keyword` (single)

Search ONE keyword, collect every result listing id, then validate them in `<= K`
chunks via `triggerAndWait scanListingsByIds` and fire `scan-listings-by-seller` for
each fitting verdict. Self-gates on `scan_keyword.last_scanned_at`.

```ts
interface ScanListingsByKeywordPayload {
  marketplace: string;
  keyword: string;
  config?: ScanConfig;
  forceRefresh?: boolean; // bypass the freshness self-gate
}
```

```jsonc
{ "marketplace": "ebay", "keyword": "drone" }
```

```jsonc
// force a re-scan even if recently scanned
{ "marketplace": "ebay", "keyword": "drone", "forceRefresh": true }
```

---

## `scan-listings-by-ids` (the listing batch leaf, self-recursive)

The one task that scans listing detail. Handed `> listingScanBatchSize` (K) ids it
**fans out** — chunks into `<= K` pieces and `batchTrigger`s ITSELF, one run per chunk,
fire-and-forget (`mode: "fanned"`). Handed `<= K` ids it **scans inline** — a paced
loop (`getListing` → thresholds → persist if it fits), then — still in the same run,
after the paced fetches — sends the titles of the listings it **inserted** (first time
seen; rescans are never re-sent) verbatim to OpenAI in one call (up to 50 titles per
request, so one call at K = 50) and stores each answer as a
`scan_keyword` linked from `scan_listing.keyword_id`. Only when
`keyword_llm_enabled = true` and a key is set; otherwise they stay unresolved for the
retry tool. Returns `{ mode: "scanned", verdicts, succeeded, notFound, failed, unfit, aborted }`
— a fitting verdict carries `isNew`, `title` and `categoryPath`. Each listing checks
freshness before fetching detail and reuses stored metrics while within its
cooldown. Listing batches have no idempotency key. "Scan one listing" is a 1-element
array. Ids may be bare or full listing URLs.

```ts
interface ScanListingsByIdsPayload {
  marketplace: string;
  listingIds: string[];
  config?: ScanConfig;
}
```

```jsonc
// cron orphan-catch hands the whole stale array; it self-fans to <=K leaf runs
{
  "marketplace": "ebay",
  "listingIds": ["204413360253", "115678901234"]
}
```

```jsonc
// scan a single listing — just a 1-element array
{ "marketplace": "ebay", "listingIds": ["204413360253"] }
```

---

## `scan-listings-by-seller` (single)

Fetch ONE seller's stats, paginate their catalog, then chunk the catalog into `<= K`-id
pieces and fan them over `scan-listings-by-ids` with an **awaited** wave
(`concurrencyLimit: 1` → one seller's whole store finishes before the next; each chunk
lands on its own box/IP). Self-gates on `scan_seller.last_scanned_at`.

```ts
interface ScanListingsBySellerPayload {
  marketplace: string;
  sellerId: string; // marketplace seller username/handle
  config?: ScanConfig;
  forceRefresh?: boolean; // bypass the freshness self-gate
}
```

```jsonc
{ "marketplace": "ebay", "sellerId": "hanksminerals" }
```

```jsonc
{ "marketplace": "ebay", "sellerId": "hanksminerals", "forceRefresh": true }
```

---

## Notes

- **Freshness self-gate:** keywords, sellers and listings check `last_scanned_at`
  against the matching inline cooldown and skip if fresh. Intervals are listed in
  [architecture](scan-architecture.md#4d-marketplace-cron-task).
  `forceRefresh: true` bypasses only the keyword/seller parent's check.
  Legacy `*RescanAfter` columns are removed from the schema; old inline config
  fields are ignored.
  Listing checks apply to discovery and queued runs too.
  Fresh IDs return stored verdicts with `isNew: false`, counting toward parent
  completion without fetching detail, writing snapshots or extracting keywords.
  Listing batches have no idempotency key; timestamp checks do not lock stale IDs.
- **Launch suppression:** keyword bulk launch and both seller launch paths use
  explicitly global keys with a fixed two-hour TTL, independent of cadence. This
  deduplicates the same entity across parent runs and cron ticks within that window.
  Retained keys, including incomplete/failed/canceled/fresh-skipped runs, may delay
  redispatch until expiry. No key-reset hooks are used. See the
  [architecture contract](scan-architecture.md#2-freshness-and-launch-suppression)
  for queue/wait limits and deployed verification requirements.
- **Parent output:** keyword and seller tasks return `status: "completed"`,
  `"incomplete"`, or `"skipped"`. Incomplete results include available coverage and
  failure counters/reasons and leave `last_scanned_at` unchanged. An incomplete
  domain result can be a successful Trigger.dev run. Both parents have one task
  attempt; unexpected failures do not immediately retry the whole tree.
- **Seller promotion** happens only on the **keyword** path (it reads verdicts and fires
  sellers). The seller-catalog and cron-orphan listing paths never promote sellers from a
  listing — that would loop.
- **Batch error handling:** within a leaf run, a persona-level error (401/403/429/5xx)
  aborts the rest of the batch and routes once (the unscanned ids stay stale for the cron
  to re-pick); a typed listing-detail 404 increments `notFound` and completes that check for this
  attempt. It does not delete/end a listing or create a snapshot. Parse/unknown
  errors and other-endpoint 404s remain unresolved `failed`. The completion rule
  counts verdicts (including threshold rejects) plus `notFound` plus `failed`
  against the requested count, requiring no abort or unresolved failures. A leaf never throws
  on scan failures — only on infra (profile load, OOM → escalate machine).
