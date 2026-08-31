# Scan task payloads

Reference for triggering the scan pipeline tasks (Trigger.dev v4). All tasks are
**marketplace-agnostic** — pass `marketplace: "ebay" | "shop"` and the adapter +
bearer pool dispatch on that string.

## Pipeline at a glance

Listing detail is scanned by **one** task — `scan-listings-by-ids`, a self-recursive
launcher + paced batch leaf (handed `> K` ids it fans into `<= K` child runs; handed
`<= K` it scans them inline and returns verdicts). There is no single-listing task.

```
ebay-listings-scanner (cron)
 ├─ scan-listings-by-keywords  (bulk)  ─► scan-listings-by-keyword (single)
 │                                          └─(await per <=K chunk)─► scan-listings-by-ids
 │                                                  └─(per fitting verdict)─► scan-listings-by-seller
 ├─ scan-listings-by-seller    (single, one run per stale seller)
 │     └─(awaited wave of <=K chunks)─► scan-listings-by-ids
 └─ scan-listings-by-ids       (orphan listings; self-fans > K ids into <=K leaf runs)
```

- **keyword** validates in `<= K` chunks: it `triggerAndWait`s `scan-listings-by-ids`
  per chunk, reads the verdicts, and fires `scan-listings-by-seller` for each fitting
  listing **the moment its chunk returns** (deduped, fire-and-forget).
- **seller** waves `<= K`-id chunks over `scan-listings-by-ids` as an **awaited** fan-out
  (`concurrencyLimit: 1`), so one seller's whole catalog finishes before the next starts.
- **K** is `scan_config.listingScanBatchSize`; each leaf run paces its `<= K` fetches on
  one box/IP (`listingScanConcurrency` + jittered `listingScanDelay{Min,Max}Ms`).

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

### `config` is optional everywhere

Every task accepts an optional `config` (`ScanConfig`). **Omit it** and the task
loads the marketplace's row from `scan_config` itself. The cron pre-loads it once
and threads it down so child tasks don't re-query. Only pass it inline to override
the DB values for a one-off run. Fields (money in integer cents, durations in
minutes): `enabled`, `keywordRescanAfter`, `sellerRescanAfter`, `listingRescanAfter`,
`maxSearchPages`, `maxListingPages`, `minItemSold`, `minPriceCents`, `maxPriceCents`
(nullable), `minSoldLast24h` (nullable), `keywordBatchSize`, `sellerBatchSize`,
`listingBatchSize` (stale listings picked per cron tick), `listingScanBatchSize` (= K,
listings per leaf run + fan-out threshold), `listingScanConcurrency` (intra-leaf, =1),
`listingScanDelayMinMs` / `listingScanDelayMaxMs` (jittered per-fetch pacing).

---

## `ebay-listings-scanner` (cron)

Scheduled heartbeat. Picks stale keywords/sellers/listings and fires the bulks.
Schedule-triggered — no custom payload. Trigger manually with `{}` to run a tick now.

```jsonc
{} // schedule payload is injected by Trigger.dev (timestamp, lastTimestamp, …)
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
loop (`getListing` → thresholds → persist if it fits → extract keywords) and returns
`{ mode: "scanned", verdicts, succeeded, failed, unfit, aborted }`. No freshness gate,
no idempotency key — listing scans are cheap and intentionally ungated. "Scan one
listing" is a 1-element array. Ids may be bare or full listing URLs.

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

- **Freshness self-gate:** only **keyword** and **seller** check `*_last_scanned_at` vs
  the matching `*RescanAfter` (minutes) and skip if fresh — they fan out big trees, so a
  fresh skip is worth it. `forceRefresh: true` bypasses it; `*RescanAfter <= 0` disables
  it. **Listings are ungated** (no freshness gate, no idempotency) — cheap, always scan.
- **Idempotency:** the keyword launcher (`scan-listings-by-keywords`) stamps a per-keyword
  key and the cron stamps a per-seller key (TTL = the rescan window) so a still-running
  entity isn't re-enqueued each tick; seller promotion from the keyword path keys on
  `["seller", marketplace, sellerReference]`. Listing runs carry no idempotency key.
- **Seller promotion** happens only on the **keyword** path (it reads verdicts and fires
  sellers). The seller-catalog and cron-orphan listing paths never promote sellers from a
  listing — that would loop.
- **Batch error handling:** within a leaf run, a persona-level error (401/403/429/5xx)
  aborts the rest of the batch and routes once (the unscanned ids stay stale for the cron
  to re-pick); a per-listing error (404/parse) is tallied and skipped. A leaf never throws
  on scan failures — only on infra (profile load, OOM → escalate machine).
