# Marketplace cron rollout

The schedule lives in [scan-crons.ts](../src/workflows/scan/scan-crons.ts).
Cooldowns are defined inline per sweep in the `scan-cron` task, with matching
values in the scan-time freshness checks. See the
[cadence table](scan-architecture.md#4d-marketplace-cron-task).

No config UPDATE is needed for these intervals. The generated migration in
[migrations](../../../packages/db/src/migrations/) drops `keyword_rescan_after`,
`seller_rescan_after`, and `listing_rescan_after` from `scan_config`. This schema
cleanup is separate from deploying the inline intervals. Old cooldown fields in
inline task config are ignored. Batch sizes, thresholds and the enabled switch
still come from each marketplace's `scan_config` row.

Deploy the updated worker and let runs on older worker versions finish before
applying the reviewed migration: older versions select the removed columns.
Worker deployment does not apply database migrations.

Retire any schedule attached to `ebay-listings-scanner`, `scan-listings-cron`,
`scan-sellers-cron`, or `scan-keywords-cron` in the Trigger.dev dashboard; removing
a source task does not establish that an externally created schedule has been
deleted. Declarative schedules of removed tasks should disappear on deploy; confirm
that in the dashboard.

Deploy the scan worker with `bun run trigger-scan:deploy`. This registers the one
declarative production schedule for `scan-cron` and deploys the inline cooldowns;
deploying the app/API alone does not. Verify one active schedule on `scan-cron` in
its Schedules tab; do not also create a dashboard schedule for it. Development runs
have no declarative cron. This behavior follows
[Trigger.dev's scheduled task contract](https://trigger.dev/docs/tasks/scheduled).

Check the first ticks for per-entity marketplace results and completed scan
timestamps. The keyword and seller sweeps skip marketplaces whose adapter lacks
those methods (shop today: listing detail only) and report them as `unsupported`;
that is expected, not a failure.
The [remaining ownership and capacity limits](scan-architecture.md#2-freshness-and-launch-suppression)
still apply. One tick sweeps listings, then sellers, then keywords; the scan runs it
launches use [entity priorities](scan-architecture.md#4e-scan-run-priority). Priority is
documented per queue and the scan tasks keep separate queues, so verify on the
deployed server whether listing runs dequeue ahead of seller and keyword runs under
contention, and that parent/child progress holds. Priority never preempts running
tasks or enforces a strict sequence.
Setting `scan_config.enabled = false` stops subsequent cron dispatch for that
marketplace; it does not cancel tasks already queued or executing.
