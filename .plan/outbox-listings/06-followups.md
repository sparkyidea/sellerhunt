# Part 6 — Follow-ups (NOT in this PR)

Sketches only, kept here so the next chapter has a starting point.

## 6a — Variant-level price + quantity

`entityType: 'listingVariant'`, actions `updateVariantPrice`,
`updateVariantQuantity`.

Differences from listing-level:

- eBay API: `ReviseFixedPriceItem` with a `Variations.Variation[]` payload.
  `ReviseInventoryStatus` does *not* support variations.
- Pull protection lives in `pull-listings/upsert.ts` at the *variant* upsert
  step (already a separate query today).
- Fingerprint includes `variantId`, not just `listingId`.
- Confirmation matches against the variant's row in the pulled `Listing`'s
  `listingVariants[]`.
- Concurrency key: variant's internal id (so two different variants on the
  same listing can run in parallel — eBay's API tolerates it via separate
  ReviseFixedPriceItem calls; if rate-limited, narrow concurrency later).

Estimated effort: ~half this PR's footprint, mostly because the four-piece
pattern is now well-trodden.

## 6b — Broader listing revisions

`reviseListing` action with a freeform payload covering title, description,
item specifics, condition, etc.

Bigger than 6a:

- Fingerprint scope grows. Either fingerprint the full payload (any field
  drift = miss) or pick a stable subset.
- Confirmation gets fuzzy — "did the title change?" is a harder question
  than "is price $X exactly?". Likely needs per-field comparison helpers.
- Image changes are a separate beast (eBay uses `PictureURL[]` with hosted
  picture rotation), defer to its own action.

## 6c — Order-side write actions

`entityType: 'order'`, actions like `cancelOrder`, `refundOrder`,
`markPaidManually`.

Each is its own narrow action with its own eBay endpoint. Same four-piece
pattern, no surprises. The pull-protection field set grows (status,
paid, paidAt, etc., depending on the action). Consider:

- `cancelOrder` — uses `IssueRefund` or `CancelOrder` endpoint. Local
  protection: `status` (already protected today).
- `refundOrder` — partial vs full refund payload. Protection: `paid`,
  `refundedAmount` (new field?).

These can land one at a time — no need to batch.

## 6d — Bulk push optimisation

`ReviseInventoryStatus` accepts up to 4 SKUs per call. The push task could
batch outbox rows by `(channelId, action)` and submit one combined call.
Optimisation only — doesn't change semantics. Worth doing once write traffic
is observable in production.

## 6e — Conflict UI

The conflict-escalation cron already flips long-pending rows to `conflict`,
and `sync.retryOutboxRow` / `sync.cancelOutboxRow` already exist. What's
missing is a UI:

- Per-listing badge when an outbox row is in `failed` / `conflict`.
- A drawer or modal showing the local payload vs `remoteSnapshot`.
- One-click retry / cancel.

Frontend work; not a backend gap.

## 6f — Webhook / push notifications

Still pending from the previous PR's plan
(`.plan/trigger-cron-sync/04-followup-ebay-webhook.md`). Replaces the
15-min cron's discovery role for orders and reduces edit-to-DB latency to
seconds. Independent of the outbox work — they compose.

## Suggested ordering

```
 6a (variants)  ──►  6b (revisions)  ──►  6e (UI)
 6c (order writes) is independent — pick whichever order action becomes
                                     user-visible first
 6d / 6f are cross-cutting opt-ins
```
