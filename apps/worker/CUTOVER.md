# P16 — BullMQ Cutover Runbook

Moves marketplace sync from Trigger.dev (`packages/trigger-sync`) to
`apps/worker`. Carrier tracking is OUT of scope: `poll-tracking` stays on
Trigger.dev permanently. Webhooks deliver straight to the worker's own
public URL — the API is not in the delivery path.

The database is a development instance: there is no data backfill in this
runbook (channels get reconnected fresh, which also registers their
webhook subscriptions at the worker URL).

Every step is reversible until the final slim-down; do the steps in order
and observe between them. `apps/worker/OPERATIONS.md` has the endpoints
and alert thresholds referenced here.

## 1. Deploy the worker (control plane)

- [D] Create the worker service on the same Docker network as Redis
      (`REDIS_QUEUE_URL` is an internal hostname): Dokploy app with the
      railpack builder, same as the API — repo root, app directory
      `apps/worker` (build runs tsdown, `start` serves `dist/index.mjs`).
      **1 replica** (scale to 2 after the observed cycle — schedulers are
      replica-safe).
- [D] Service port `8788`; health check on `/health` — liveness only.
      Do NOT health-check `/ready`: it flaps on dependency blips and
      would restart-loop a worker that self-recovers. Poll `/ready` from
      monitoring instead (see `OPERATIONS.md`).
- [D] Env per `apps/worker/.env.example`, with:
      `SYNC_SCHEDULERS_ENABLED=false`,
      `WEBHOOK_BASE_URL=https://worker-jing.dashseller.dev`.
- [ ] Give the service the public domain `worker-jing.dashseller.dev`
      (Cloudflare-proxied, like the API). The webhook receiver and
      `/stats` live here; marketplaces must be able to reach it.
- [D] Confirm Redis runs `maxmemory-policy noeviction` + AOF.
- [d] Verify: `GET /ready` → 200 over the public URL.

## 2. Redeploy the API from this branch

- [d] API env gains `WEBHOOK_BASE_URL` (same value as the worker's).
      `/webhook` no longer exists on the API — expected.
- [d] Optional (org-migration wipe already pending): wipe the dev DB and
      apply migrations 0000+0001 before reconnecting anything.

## 3. Reconnect channels

Reconnect every channel in the app UI (eBay reconnect was already
required by the scope-set change). Connecting registers webhook
subscriptions at `${WEBHOOK_BASE_URL}/webhook/{marketplaceId}` — the
worker must be publicly up FIRST, because eBay challenges the endpoint
synchronously during registration. The 6-hour
`dispatch-subscription-repairs` scheduler keeps subscriptions converged
afterwards.

## 4. E2E against the public worker URL

```sh
cd apps/worker
bun scripts/send-test-webhook.ts ebay-challenge --url https://worker-jing.dashseller.dev
bun scripts/send-test-webhook.ts orders-updated --url https://worker-jing.dashseller.dev --shop <sandbox>.myshopify.com
```

Then one REAL sandbox event per marketplace (eBay POSTs can't be forged —
ECDSA is eBay's): place/update a sandbox order, touch a product → verify
the rows land and `/stats` counters move.

## 5. Disable Trigger schedules

In the Trigger dashboard, disable the schedules attached to these FOUR
task ids (they are dashboard-attached, not code-attached):

- `sync-channels-scheduler`
- `outbox-stale-reset`
- `outbox-conflict-escalation`
- `outbox-cleanup`

KEEP `poll-tracking` enabled — tracking stays on Trigger. (`sync-channel`,
`poll-trackings`, `sync-shipment` are plain child tasks; they carry no
schedules.) Leave the Trigger worker running — in-flight runs finish
through the same fenced cores.

## 6. Enable the BullMQ schedulers

Set `SYNC_SCHEDULERS_ENABLED=true` on the worker deployment and restart.
Verify in logs: **eight** scheduler registrations. Then force immediate
coverage instead of waiting the 15-min cadence:

```sh
cd apps/worker && bun scripts/dispatch-channel-sync.ts
```

## 7. Observe one full cycle (≥ 1 h)

- Every scheduler fired; `/stats` counters moving; no
  `reconciliation_required` accumulation; the Postgres backstop queries in
  OPERATIONS.md clean (`bun scripts/alert-check.ts` runs them all).
- At least one webhook-driven and one dispatcher-driven sync landed per
  marketplace; one shipment push + UI retry exercised (the P15 gate).
- Trigger dashboard shows zero in-flight runs for the four disabled
  schedules; `poll-tracking` still firing.

## 8. Slim `packages/trigger-sync` to tracking-only (separate commit)

After the observed cycle: delete the channel-sync/shipment/outbox
workflows + `nodes/**`, keep `poll-tracking`/`poll-trackings` + a slimmed
context, slim `packages/env/src/trigger-sync.ts`, regenerate `bun.lock`,
sweep the docs. Redeploy trigger-sync so the dead tasks unregister.

Code slim-down DONE (this branch, together with the post-window cleanup
below). Still to run: `bun trigger-sync:deploy` so the dead tasks
unregister.

## Rollback (any point before step 8)

1. Set `SYNC_SCHEDULERS_ENABLED=false` and restart the worker —
   dispatcher/outbox schedulers stop. Webhook-driven jobs keep flowing
   through the worker (they coexist safely with Trigger via the fenced
   protocol and version clocks); to stop those too, disable the channels'
   subscriptions or take the worker's public domain down.
2. Re-enable the four Trigger dashboard schedules.
3. Nothing to migrate back: both runtimes share the same cores,
   `channel_sync_state` watermarks, and outbox protocol. A generation
   bumped by BullMQ fences out retained BullMQ jobs, not Trigger runs
   (legacy callers are status-fenced only).

## Post-rollback-window cleanup (weeks later, separate change)

- DONE — legacy `channel.{syncedAt,syncStatus,syncError}` projection
  dropped (migration `0002_sour_paibok.sql`, applied by the deploy-branch
  CI or `bun db:migrate`). The channels-table UI columns are now a
  cross-domain rollup over `channel_sync_state` computed in
  `channel.getMany` (worst status wins, latest watermark); disconnect
  reasons land on the `channels` domain row instead of `channel.syncError`.
- NOT NEEDED — the delivery-job id scheme never changed after P9, so there
  are no stranded delayed jobs to clean.
