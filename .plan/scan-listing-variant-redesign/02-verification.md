# Verification and cutover handoff

Status: simplified DB schema and Trigger.dev scan writer are implemented in the
workspace. API/UI migration is still pending. Do not deploy this intermediate state.

No application database migration, reset, deployment, commit, issue, or PR was
performed. Existing staged changes and the user-edited schema.dbdiagram are preserved.

## Current checks

- Marketplace adapter type check: passes.
- Marketplace adapter unit suite: 34 pass.
- Worker database integration suite: 20 pass against the explicit isolated
  `dashseller_test` database on localhost:54329; never the app database.
- Worker unit suite: 89 tests pass, two suites cannot load because of the existing
  bare `techte` token in `listing-verdict.ts:12`.
- Worker type check: the same existing `techte` token is the only reported error.
  The user was asked whether to remove it; it was left untouched pending a reply.
- Targeted lint for modified worker/adapter TypeScript files: passes.
- `git diff --check`: passes.
- Earlier schema-only verification: nine schema tests, DB package type check
  and targeted lint passed. This follow-up changes consumers, not the schema.

After the lastScannedAt follow-up, all 20 worker integration tests pass again;
89 unit tests pass, with the same two suites and type check blocked by `techte`.
Scoped lint passes for all seven changed TypeScript/TSX files. The lifecycle
display reads lastScannedAt; unrelated API/UI conversion remains pending.

The user resolved the earlier categoryPath test conflict: keyword extraction takes
listing ID and title only. That workflow assertion is updated and passes.

Integration coverage includes atomic listing sales/history writes, one snapshot
per scan even for multi-variant listings, unchanged counters and equal timestamps,
stable default/native identities, removal/reappearance, unknown/decreasing sales,
runtime validation, concurrent first insert, and rollback after snapshot failure.
Scheduling tests verify listing last_scanned_at, independent seller last_scanned_at,
and keyword-pool writes that leave listings unchanged.

## Remaining work

1. Resolve the unrelated `techte` token and rerun the full worker checks.
2. Replace the variant-history API/UI and obsolete read-side fields with the
   listing-history contract in [01-model.md](01-model.md).
3. Update the database reset test and tRPC integration fixtures for listing
   snapshots; reverify the full migration chain and all read-side tests.
4. Smoke-test the completed UI and live marketplace scans before cutover.

The manual keyword retry task was intentionally removed. It remains recoverable
through Git. New qualifying listings still feed inline keyword extraction, but
there is no catch-up selector, listing link, or persisted attempt counter.

## Migrations and deployment

Existing migrations 0006–0008 remain intact. Migration 0006 deletes old
listing-owned data; 0007–0008 represent the prior variant-history design.
Migration 0009 creates listing sales snapshots, drops variant snapshots and
obsolete columns/sequence, and creates updated_at/history indexes.
Migration 0010 removes the duplicate sales-count DB checks at the user's request.
Migration 0011 renames listing updated_at to last_scanned_at and its freshness
index. Migrations 0012–0013 remove optional listing/variant and seller indexes.
No old measurements are converted or backfilled. Unrelated tables are preserved.

The isolated test database applied pending migrations during integration tests.
Application migration state must be inspected before cutover. Stop old workers
and readers, apply the reviewed migration chain, deploy matching worker/API/UI
code, smoke-test, then resume discovery. Applying pending 0006 discards listing
IDs and history; without a backup, deleted history cannot be recovered.

This step modifies no schema or generated migrations. The earlier schema DBML
remains current; the separate user-edited schema.dbdiagram was not touched.
