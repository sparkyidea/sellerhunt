# Worker Operations

Runbook for `apps/worker` — the BullMQ consumer for marketplace sync
(queues, schedulers, outbox control plane) AND the public webhook
receiver: marketplaces deliver straight to
`${WEBHOOK_BASE_URL}/webhook/{marketplaceId}` on this process. Carrier
tracking is NOT here: it stays on Trigger.dev (`poll-tracking` in
`packages/trigger-sync`). The API produces jobs too (tRPC mutations) and
registers webhook subscriptions, but is not in the delivery path.

## Endpoints

| Path                    | Meaning                                                            |
| ----------------------- | ------------------------------------------------------------------ |
| `/health`               | Liveness — process is up.                                          |
| `/ready`                | Readiness — DB round-trip + Redis ping both succeed (503 if not).  |
| `/stats`                | Operational snapshot: queue depths, outbox backlog, run counters.  |
| `/webhook/:marketplace` | Public delivery ingress (GET = eBay challenge, POST = deliveries). Authenticity proven per-delivery by signature. |

`/stats` shape:

```json
{
  "queues": { "sync-orders": { "waiting": 0, "active": 1, "delayed": 3, "failed": 0 }, ... },
  "outbox": { "pending": 0, "reconciliationRequired": 0, "oldestPendingAgeSeconds": null },
  "counters": { "completed": 120, "failed": 2, "rateLimited": 5, "stalled": 0 }
}
```

Counters are per-process and reset on restart; queue/outbox numbers are
live reads from Redis/Postgres and are replica-independent.

## Alerts

Thresholds are deliberately generous — the schedulers self-heal most
conditions (drainer every 1m, stale reset + sending sweep every 5m).
Alert on states the machinery cannot fix by itself.

### From `/stats` (poll every minute)

| Signal | Threshold | Meaning / action |
| ------ | --------- | ---------------- |
| `outbox.reconciliationRequired > 0` for > 10 min | page | A send timed out mid-flight and recovery isn't landing. Check `sync-shipments` failed jobs and marketplace status. Rows are safe (fenced, owner cleared) but shipments aren't reaching the marketplace. |
| `outbox.oldestPendingAgeSeconds > 900` | warn | Drainer runs every minute — a 15-min-old pending row means the drainer or `sync-shipments` queue is stuck. Check `/ready` and `queues.sync-shipments`. |
| `queues.*.failed > 20` on any queue | warn | Retries exhausted at volume. Inspect failed jobs: `queue.getFailed()` or Redis UI. Marketplace outage is the usual cause; jobs re-enter via schedulers/webhooks once it clears. |
| `queues.*.waiting` growing monotonically for > 30 min | warn | Consumers can't keep up or workers are down. Check worker replica count and `counters.stalled`. |
| `counters.stalled` increasing | warn | Jobs exceeding `lockDuration` (worker OOM/CPU starvation). `maxStalledCount: 1` sends a twice-stalled job to failed — look there for the payloads. |
| `/ready` 503 for > 2 min | page | Worker lost DB or Redis. |

### From Postgres (backstop, every 5–15 min — works even if the worker is down)

```sql
-- Outbox rows stuck in any non-terminal state for over an hour.
SELECT status, count(*), min(updated_at) AS oldest
FROM sync_outbox
WHERE status NOT IN ('confirmed', 'canceled')
  AND updated_at < now() - interval '1 hour'
GROUP BY status;
-- Any 'conflict' row: needs a human (invariant violation or ambiguous
-- remote state). Any 'pending'/'failed' pileup: worker-side problem.

-- Channels whose sync is erroring per domain.
SELECT channel_id, domain, error, updated_at
FROM channel_sync_state
WHERE error IS NOT NULL
ORDER BY updated_at DESC
LIMIT 20;

-- Connected channels whose sync silently stopped running (dispatcher
-- fires every 15 min; a 1-hour gap in last_run_at means the schedule
-- stopped or every run is dying before recording an attempt). LEFT join:
-- a channel whose runs die before ever recording has NO sync-state row,
-- and that missing row must alert, not vanish. The connected_at guard
-- grants a just-(re)connected channel the same one-hour grace so it
-- doesn't page before its first dispatcher tick.
SELECT c.id, c.display_name, d.domain, s.last_run_at
FROM channel c
CROSS JOIN (VALUES ('orders'), ('listings')) AS d(domain)
LEFT JOIN channel_sync_state s
  ON s.channel_id = c.id AND s.domain::text = d.domain
WHERE c.connected = true AND c.enabled = true AND c.archived = false
  AND (c.connected_at IS NULL OR c.connected_at < now() - interval '1 hour')
  AND (s.last_run_at IS NULL OR s.last_run_at < now() - interval '1 hour');

-- Destructive events (uninstall / auth-revocation) whose disconnect job
-- exhausted its retries with grant verification still failing. The job is
-- delivery-deduped and removed on failure, so this marker is the ONLY
-- durable trace; it needs a human to verify the marketplace connection.
-- Resolves itself on a later reconnect (connected_at newer than the
-- marker) or a completed disconnect (connected = false).
SELECT c.id, c.display_name, s.error, s.updated_at AS marked_at
FROM channel_sync_state s
JOIN channel c ON c.id = s.channel_id
WHERE s.domain = 'channels' AND s.status = 'error'
  AND s.error LIKE 'Unresolved disconnect:%'
  AND c.connected = true
  AND (c.connected_at IS NULL OR c.connected_at < s.updated_at);
```

## Webhook delivery log

Every **verified** inbound delivery is upserted into `webhook_delivery`
(fire-and-forget; never read by the processing path) and mirrored as one
JSON log line — grep the worker log for `webhook` to isolate receiver
traffic from scheduler noise. Signature-mismatch requests are logged as a
warn but never written to the table (public endpoint — forgeries must not
get a DB write). Redeliveries collapse onto `(marketplace, delivery_id)`,
bumping `attempts` and overwriting `outcome`
(`enqueued | ignored | ineligible | unattributed | enqueue_failed`).

```sql
-- Did anything arrive, and what happened to it?
SELECT marketplace, topic, outcome, attempts, channel_id, received_at
FROM webhook_delivery ORDER BY received_at DESC LIMIT 20;

-- Payload samples for a topic we subscribe to but don't handle yet.
SELECT payload FROM webhook_delivery WHERE topic = 'NEW_MESSAGE'
ORDER BY received_at DESC LIMIT 3;
```

`attempts > 1` means the marketplace redelivered — pair with `outcome`
to tell a recovered enqueue failure from a flapping receiver.

## Schedulers (all on `sync-control`, registered when `SYNC_SCHEDULERS_ENABLED=true`)

| Scheduler | Cadence | Does |
| --------- | ------- | ---- |
| `dispatch-channel-syncs` | 15 min | Enqueues orders + listings catch-up per connected channel, spread over a 15-min window by channel-id hash. |
| `dispatch-subscription-repairs` | 6 h | Reconciles webhook subscriptions per channel. |
| `dispatch-outbox-recovery` | 1 min | Scan-only dispatch of `reconciliation_required` rows to `recover-outbox`. |
| `drain-sync-outbox` | 1 min | Enqueues `sync-shipment` for `pending` rows (the durable fallback when a producer's post-commit enqueue failed). |
| `outbox-stale-reset` | 5 min | `claimed`/`reconciling` untouched > 15 min → back to `pending`, generation bumped. |
| `outbox-sending-sweep` | 5 min | `sending` untouched > 10 min → `reconciliation_required`, owner cleared, generation bumped. |
| `outbox-conflict-escalation` | 15 min | Logs `conflict` rows older than 60 min for operator attention. |
| `outbox-cleanup` | 1 h | Prunes old terminal rows + `webhook_delivery` rows older than 30 d. |

Schedulers are `upsertJobScheduler`-idempotent — every replica registers
the same set; exactly one firing per cadence.

## Redis

- **Provisioning**: `maxmemory-policy noeviction` and AOF persistence are
  required. Eviction would silently drop jobs; correctness does not
  depend on Redis durability (Postgres is the durable boundary for outbox
  work) but delivery-webhook jobs exist only in Redis until processed.
- **Connections**: each worker replica holds one blocking connection per
  queue-worker (5) plus the shared producer connections (~5 lazily
  created) and scheduler upserts; the API holds up to 5 producer
  connections. Budget ~12–18 connections per worker replica + API.
- **Ops budget**: steady-state load is dominated by the 1-min control
  jobs and worker polling — well under 100 ops/s at current scale.
- **Producers fail fast** (`enableOfflineQueue: false`): if Redis drops,
  API enqueues reject immediately; webhook receivers ACK per marketplace
  policy and the 15-min dispatcher + outbox drainer recover the missed
  work. No action needed beyond restoring Redis.

## Scripts (`apps/worker/scripts/`, run from `apps/worker` so `.env` loads)

- `dispatch-channel-sync.ts [channelId] [--force]` — force an immediate
  orders+listings sync instead of waiting the 15-min cadence; promotes a
  delayed dedup-holder so "immediate" means immediate. `--force` discards
  watermarks (full resync).
- `alert-check.ts` — one run of the alert table above: Postgres backstop
  queries + optional `WORKER_URL` polls, one aggregated Resend email /
  webhook message on breach. Scheduled via `.github/workflows/ops-alerts.yml`
  (every 10 min from the default branch); runnable ad hoc during
  observation windows.
- `send-test-webhook.ts <fixture> [--url ...]` — signed Shopify fixtures +
  the eBay challenge handshake against a live receiver.

## Common operations

- **Pause a queue**: `await jobs.queue("sync-orders").pause()` (resume
  with `.resume()`). Global — affects all replicas.
- **Retry failed jobs in bulk**: `const failed = await queue.getFailed();
  await Promise.all(failed.map((j) => j.retry()))`. For outbox-backed
  jobs prefer the UI retry (tRPC `sync.retryOutboxRow`) — it bumps the
  fencing generation properly.
- **Clean legacy delivery jobs after an id-scheme change**:
  `await queue.clean(0, 10_000, "delayed")` etc. — delivery job ids are
  content-derived, so a scheme change strands old ids until cleaned.
- **Scale**: add worker replicas freely; global concurrency caps
  (`QUEUE_TOPOLOGY[].globalConcurrency`) hold across replicas, so extra
  replicas add resilience and per-queue local throughput up to the cap.
