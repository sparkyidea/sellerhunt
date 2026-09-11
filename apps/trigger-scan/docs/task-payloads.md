# Scan task payloads

Task definitions live in `src/workflows/scan`. Pass the marketplace explicitly:
eBay supports keyword, seller, and listing scans; shop supports listing detail only.
See [architecture](scan-architecture.md) for completion, freshness, retry, and
persistence contracts, and [rollout](scan-cron-rollout.md) before scheduling.

## Pipeline

Cron dispatches listing chunks, sellers, and the bulk keyword launcher asynchronously.
The bulk launcher dispatches singular keywords asynchronously. Keywords await listing
batches and then fitting sellers; sellers await their catalog's listing batches.
Leaves process sequentially, never self-fan, and finish inline keyword extraction
for newly inserted fitting rows before surfacing accumulated scan failures.

```ts
import { tasks } from "@trigger.dev/sdk";

await tasks.trigger("scan-listings-by-keywords", {
  marketplace: "ebay",
  keywords: ["drone", "nintendo switch"],
});
```

Dashboard → task → Test also accepts the JSON payloads below. Application callers
supply marketplace/entity tags automatically. Launch keys and task priorities have
been removed. Duplicate suppression uses paginated run lookup and is best effort.

## Optional scan configuration

Every scan workflow accepts optional `config: ScanConfig`. Omit it to use the
marketplace's `scan_config` row. Cron loads config once and passes it to children;
inline overrides remain useful for one-off runs. Payload marketplace determines
adapter/DB identity even when an override names another marketplace.

Config fields: `marketplace`, `enabled`, `maxSearchPages`, `minItemSold`,
`minPriceCents`, `maxPriceCents` (nullable), `minSoldLast24h` (nullable),
`keywordBatchSize`, `sellerBatchSize`, `listingBatchSize`, `listingScanBatchSize` (K),
`listingScanDelayMinMs`, `listingScanDelayMaxMs`, and `keywordLlmEnabled`.
Money uses integer cents. Cooldowns, LLM model/request
size are code constants. K is caller chunk size; a larger manual leaf payload logs
a warning and runs sequentially on its assigned box.

## `scan-cron`

Trigger.dev provides the schedule payload; there is no custom marketplace/config
payload. Each tick sweeps listings, sellers, then keywords across configured
marketplaces. It checks capability/enablement and in-flight work before selecting
eligible stale references and suppresses busy references before launch. It does not
wait or advance scan timestamps.

Output: `{ results: [{ entity, marketplace, status, triggered?, reason? }] }`.
Statuses include `completed`, `disabled`, `unsupported`, `incomplete` for dispatch
failure, and `skipped` with `in-flight` or `in-flight-unknown`. These are dispatch
outcomes, not the entity scan completion contract. Busy references can still consume SQL selection capacity in this stage.

## `scan-listings-by-keywords`

```ts
interface ScanListingsByKeywordsPayload {
  marketplace: string;
  keywords: string[]; // nonempty; exact duplicates removed
  config?: ScanConfig;
}
```

```json
{ "marketplace": "ebay", "keywords": ["drone", "lego star wars", "dyson v8"] }
```

Registers missing keyword rows before lookup/dispatch, preserving existing metadata.
Dispatches non-busy keywords in batches of at most 1,000. Lookup/dispatch failures
throw; retries and the persisted rows support recovery. Successful output confirms
only dispatch/existing work: `{ marketplace, triggered, skippedInFlight }`.

## `scan-listings-by-keyword`

```ts
interface ScanListingsByKeywordPayload {
  marketplace: string;
  keyword: string;
  config?: ScanConfig;
  forceRefresh?: boolean; // bypass only this parent's freshness gate
}
```

```json
{ "marketplace": "ebay", "keyword": "drone", "forceRefresh": true }
```

Registers the input before risky work, searches up to `maxSearchPages`, partitions
fresh listing IDs, and awaits stale listing batches followed by fitting sellers.
Returns `status: completed` with listing counts, `sellersLaunched`, and
`sellersSkippedFresh`, or `status: skipped, reason: fresh`. Deferred/in-flight
sellers appear in error details and metadata. They must become fresh or this task
throws and remains stale. Lookup failure cannot complete dependency coverage.

## `scan-listings-by-seller`

```ts
interface ScanListingsBySellerPayload {
  marketplace: string;
  sellerId: string;
  config?: ScanConfig;
  forceRefresh?: boolean; // bypass only this parent's freshness gate
}
```

```json
{ "marketplace": "ebay", "sellerId": "hanksminerals" }
```

Fetches seller stats, walks the complete catalog, partitions fresh listings, and
awaits stale chunks. An all-fresh catalog requires no child batch. Returns completed
counts, `skipped/fresh`, or `skipped/seller-gone` for an exact seller-detail 404.
Pagination/child failures and in-flight duplicates throw; failed scans never advance
the seller timestamp. No child run is guaranteed a separate physical box/IP.

## `scan-listings-by-ids`

```ts
interface ScanListingsByIdsPayload {
  marketplace: string;
  listingIds: string[]; // nonempty; bare references or listing URLs
  config?: ScanConfig;
}
```

```json
{ "marketplace": "ebay", "listingIds": ["204413360253", "115678901234"] }
```

Callers chunk by K; this task always processes its input inline. Fresh stored rows
supply verdicts with `isNew: false`. Stale detail fetches are sequential and paced.
Only fitting titled results persist; threshold rejects and missing titles remain
non-persistent. An all-fresh batch does not acquire a persona.

Success returns `{ marketplace, mode: "scanned", triggered, fresh, scanned,
notFound, unfit, verdicts }`. Fitting verdicts include `isNew`, `scanListingId`,
`title`, and `categoryPath`. Exact listing-detail 404s complete a check without a
persisted negative row. Scan failures are thrown after healthy work and inline LLM
extraction; there is no successful `fanned`/`aborted`/incomplete result. There is no shared
listing-leaf concurrency cap in this stage.

## `resolve-listing-keywords` (manual catch-up)

```ts
interface ResolveListingKeywordsPayload {
  marketplace: string;
  limit?: number; // catch-up only; default 200
  listingIds?: string[]; // scan_listing.id, not marketplace reference; [] does nothing
}
```

```json
{ "marketplace": "ebay", "limit": 500 }
```

```json
{ "marketplace": "ebay", "listingIds": ["<scan_listing.id>"] }
```

Nothing triggers this tool automatically. Both explicit-ID and catch-up selection
require listings with unresolved keywords and fewer than three attempts, within
the requested marketplace. This stage persists only fitting listing observations.

The task reloads the LLM switch from the database and has no config override.
Disabled extraction or a missing API key spends no attempts. Titles are sent in
requests of up to 50; phrases are linked to `scan_keyword` without normalization.
Needs `OPENAI_API_KEY`. LLM errors do not fail listing scans; logs record each answer.
