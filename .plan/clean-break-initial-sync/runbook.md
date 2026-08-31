# Clean-break initial-sync rework — wipe + rollout runbook

Companion to the clean-break rework (listings→orders sequencing, baseline
inventory rule, `order_line_inventory_state` merge, migration `0004`). The
wipe and the migration are **user-executed** — never run by an agent.

## Why a wipe

The rework drops the `stock_effect` / `order_line_stock_assignment` tables
without backfill, changes what `stock.quantity` means for channel-seeded
rows (marketplace **available** at `seed_observed_at`, baseline rule keys
off it), and adds a unique index on `stock (product_variant_id,
warehouse_id)` that pre-existing duplicate rows would abort. Existing
channel-derived data is unsound either way (unlinked lines, double-counted
stock) — the clean break rebuilds it from the marketplace.

## Order of operations

1. **Pause the worker / all queues**; let active jobs drain. Webhook
   deliveries keep ACKing at the API (delivery log is truncated below;
   post-deploy order events gate safely behind the listings watermark).
2. **Confirm each org that will relink has a `warehouse` row** —
   `initializeStock` silently skips seeding without one, and every line for
   that org then lands `no-stock`.
3. **Wipe BEFORE applying `0004`** (the new stock unique index must build
   on an empty table — pre-wipe duplicates would abort the migration):

   ```sql
   BEGIN;
   TRUNCATE TABLE
     "order", order_line, order_event, issue,
     shipment, shipment_line, tracking, tracking_event,
     "return", return_line,
     listing, listing_variant, product, product_variant,
     stock, stock_transaction, stock_effect, order_line_stock_assignment,
     channel_sync_state, sync_outbox, webhook_delivery
   CASCADE;
   COMMIT;
   ```

   If `0004` is somehow applied first, replace
   `stock_effect, order_line_stock_assignment` with
   `order_line_inventory_state`.

   **KEEPS:** org/user/auth tables, `channel`, `channel_token`,
   `channel_webhook_subscription`, `warehouse`, `category`,
   `marketplace_category`, `package_preset`, `setting`, `tax_rate`,
   `scan_*`, world tables (`country`/`state`/`city`/`zip`).

   **Known losses (accepted):** `shipment` rows with `source='local'`
   (purchased-label artifacts), order comments (`order_event`),
   `product_variant.unit_cost`.
4. **Apply `0004`** (deploy-branch CI or `bun db:migrate`).
5. **Deploy the new worker + API together.** The old worker writes the
   dropped tables — never run it against the migrated schema.
6. **Resume queues; relink channels** via OAuth (connect now enqueues
   listings only; the listings processor chains the first orders pull) or
   run `apps/worker/scripts/dispatch-channel-sync.ts`.
7. **Observe:**
   - listings sync-state reaches `success`;
   - `stock` rows carry `seed_basis = 'listing_available'` +
     `seed_observed_at`;
   - the chained orders full pull runs (orders sync-state appears);
   - order lines resolve (`listing_variant_id` filled), "Baseline uplift"
     `adjust` ledger rows present for pre-seed orders;
   - **no negative stock**, no conflict spike;
   - `bun scripts/alert-check.ts` clean.

## Accepted residuals (documented, not fixed)

- The seed observation is stored as BOUNDS: the listing's own provider
  observation clock when the adapter supplies one (eBay: GetItem response
  `Timestamp` — exact, lower == upper, same clock family as the order
  clocks), else app clocks captured before (lower) and after (upper) the
  page fetch. Order classification compares against the lower bound and
  restore classification against the upper, so in-window events err
  toward undersell in both directions, never oversell. Residual: the
  fallback path still carries minutes-scale app-vs-provider clock skew
  (Shopify), same undersell direction. The hours-scale host-TZ hazard is
  eliminated by the SQL-side comparisons in the inventory pass.
- Cancels/edits during the seed window are handled by restore
  classification (order `source_version_at` vs the upper seed bound).
  Residual: a PRE-seed restore on an order that was ALSO modified
  post-seed for an unrelated reason classifies as post-seed and
  over-uplifts by the restored units — rare and bounded. An order with no
  usable modification clock skips the restore uplift and records a
  conflict (understates).
- eBay first pulls: orders ≈ 90d API default; `GetSellerList` only sees
  listings ending within now→+90d — orders referencing already-ended
  listings keep unresolved references, zero inventory effects, and no
  relink storm (no variant exists to match).
- A remotely-deleted order gets ONE `getOrder` (`not-found`), which stamps
  `order.remote_missing_at`; relink skips marked orders from then on, and
  any later successful pull clears the mark. A remotely-deleted VARIANT
  on a still-live order clears the line's stored reference on the next
  re-pull (the fresh snapshot carries none), which likewise removes it
  from the relink pool.
- Un-cancel of a canceled order whose cancel predated the seed (counters
  still zero) takes the baseline path and over-uplifts — pathological,
  accepted. (A cancel restored post-seed writes reserved/released
  counters, so its un-cancel follows the normal rule correctly.)
- The chained first orders pull uses its own dedup id (`orders-chain-*`)
  so an active gated orders job can never swallow it; the trade-off is
  that it may run alongside an independent dispatcher/webhook orders pull
  — both are idempotent windowed pulls, so the duplication is harmless.
- Shopify SKU-collision variant references (pre-existing adapter caveat).
- Manual `stockRouter.create` of a duplicate (variant, warehouse) now
  errors at the DB instead of silently creating an "ambiguous" row — net
  improvement; a friendly TRPC error is out of scope.
