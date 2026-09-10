# Scan pipeline rollout

`scan-cron` declares no schedule. Keep full production fan-out disabled until all
three stages below and the deployed checks pass. Worker deployment and database
migration are separate actions.

## Stage 1: waiting parents and recoverable intake

Deploy the waiting completion contracts after focused regression tests pass.
Exercise partial listing failures, partial pagination, and failed seller children:
healthy sibling work must persist, parents must reject, and parent timestamps must
stay stale. Hide an older seller during keyword prelaunch lookup and expose it at
duplicate-child startup; that child must fail as incomplete. Repeat with the older
seller failing and then a later successful recovery.

Submit a previously unknown manual keyword while run lookup is unavailable.
Confirm intake persists before failure, retries can dispatch, and exhausted retries
leave a cron-eligible row. Existing keyword source, timestamps, and retirement must
remain unchanged. Remove temporary `.plan/scan-waiting-parents/` and the folded
`.plan/scan-freshness-prefilter/` when creating the stage's PR.

## Stage 2: persona ownership and qualification

Pause acquisition and reseeding while preflighting and applying the ownership
constraint. The preflight is read-only and deliberately does not choose survivors:

```sh
bun run packages/db/src/preflight/mobile-profile-owners.ts
```

It reads `DATABASE_URL` from `apps/api/.env` unless supplied explicitly, reports
all conflicting `(app, label)` groups, and exits nonzero on conflict. Resolve those
groups explicitly and rerun before applying the index. Do not automatically kill,
unclaim, or delete a conflicting owner.

Review generated [0005_cultured_manta.sql](../../../packages/db/src/migrations/0005_cultured_manta.sql):
three added columns (`capture`, `claimed_at`, `qualified`) and three indexes,
including `mobile_profile_one_active_owner_per_box`. Obtain approval before applying
to a shared database. Apply this additive migration before deploying consumers
that select the new columns. Existing listings default to qualified.

After deployment, run the established persona seed command. It backfills legacy
`capture` from `label`, keeps existing ownership, and inserts new captures unclaimed.
A dead capture with an active replacement reports a conflict and retains its dead
status and failure history. No automatic survivor selection is permitted.

Verify simultaneous acquisitions reuse one owner; different boxes cannot claim the
same persona; cooling owners do not rotate; three deaths in 24 hours block another
claim. Confirm both catch-up pickers and explorer list/group views exclude rejected
listings, and a later promotion enables catch-up. Remove
`.plan/scan-persona-claiming/` when creating this stage's PR.

## Stage 3: shared leaf queue and fair selection

Deploy the shared listing queue at concurrency 2 with separate parent queues.
Confirm a visible busy seller/keyword is excluded before the DB limit and cannot
consume the tick's selection budget. Check the first-scan allowance and stable
refresh ordering described in [architecture](scan-architecture.md#queues-and-cron-fairness).
A dashboard queue override is operational state; record it and confirm effective
concurrency after later deployments. Remove `.plan/scan-dispatch-fairness/` when
creating this stage's PR.

## Local validation

Run types, lint, focused scan tests, then repository tests. Use the disposable
PostgreSQL service for real multi-connection ownership and selection tests:

```sh
bun run check-types
bun x ultracite check
bun --cwd apps/trigger-scan test
bun run test
docker compose -f docker-compose.test.yml up -d --wait
bun --cwd packages/db test:integration
(cd apps/trigger-scan && bun x vitest run --config vitest.integration.config.ts)
```

Integration suites apply generated migrations to `TEST_DATABASE_URL` (default is
the disposable service on localhost:54329). Use a disposable database: these suites
clear their fixture tables. They never use `DATABASE_URL` for test setup.

## Deployed verification and schedule activation

The official [self-hosting feature table](https://trigger.dev/docs/self-hosting/overview#feature-comparison)
excludes checkpoints and warm starts. The previous assertion that waiting always
releases resources conflicts with that table. Keep these checks recorded as pending
until observed on the deployed server; local SDK tests cannot establish them.

- Record server, supervisor/worker, and SDK versions.
- Run a parent waiting on a slow child and inspect actual checkpoint creation,
  CPU/RAM/container lifetime, and parent/child queue slot behavior.
- Measure elapsed versus billed/active time and `maxDuration` accounting while waiting.
- Check parent → seller → leaf progress at the configured queue limits, including
  retries and a leaf exhausting its attempts.
- Check when newly queued, waiting, delayed, and terminal runs appear/disappear in
  every `runs.list` page. Record visibility lag; suppression remains best effort.
- Measure cold and warm startup behavior separately. Do not infer warm starts from
  checkpoint behavior or infer physical placement from queue concurrency.

Activate exactly one production schedule for `scan-cron`, `*/5 * * * *`, only after
all stages and these checks pass. Confirm legacy schedules for
`ebay-listings-scanner`, `scan-listings-cron`, `scan-sellers-cron`, and
`scan-keywords-cron` are retired. Deleting a task from source does not prove an
external schedule was removed. Development should have no schedule by default.

Monitor queue age, completion/failure counts, actual detail fetch rate, deferred
seller references, persona cooldown/death events, and per-marketplace freshness.
Adjust batch sizes/concurrency from measured capacity. One persona per box does
not imply one executing run per box, and concurrency times K is not a per-tick cap.
`scan_config.enabled = false` stops future cron dispatch for that marketplace;
it does not cancel queued/executing work.
