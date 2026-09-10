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

## Following stages

The second PR introduces automatic persona claiming, the active-owner database
constraint, and qualification-aware persistence and consumers. Its generated
migration must be reviewed and approved before shared application. The third PR
adds a shared listing queue and moves busy-reference exclusion before SQL LIMIT.
Keep full production scheduling disabled until all stages and the deployed checks
below pass.

## Local validation

Run types, lint, focused scan tests, then repository tests. Use the disposable
PostgreSQL service for the keyword registration/recovery integration tests:

```sh
bun run check-types
bun x ultracite check
bun --cwd apps/trigger-scan test
bun run test
docker compose -f docker-compose.test.yml up -d --wait
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
