# Simplify listing storage and sales history

Status: DB schema/migrations and Trigger.dev worker implementation updated.
Application database migrations are unapplied. API/UI conversion remains pending.

Listing updatedAt is now lastScannedAt in the schema, worker writes, freshness
queries, scheduling, tests, and lifecycle display. See [01-model.md](01-model.md).

This supersedes the earlier variant-history design. The user approved the exact
three-table contract in [01-model.md](01-model.md), then requested removal of
duplicate DB sales-count checks. Keep runtime validation instead.

## Work order

1. DB-first changes are prepared as migrations 0009 and 0010, preserving 0006–0008.
2. Update adapters, scan persistence/freshness, and keyword extraction. Remove the
   manual keyword retry task; retain extraction for newly inserted qualifying rows.
3. Next: replace the variant-history API/UI with listing sales history, adapt
   presentation of removed fields, and update read-side fixtures/integration tests.
4. Verify the complete migration chain against isolated test databases, then
   coordinate a reviewed application cutover. No backward compatibility or backfill.

The keyword test/code conflict is resolved by the user's explicit selection:
extraction inputs contain listing ID and title only, not category path.

Preserve unrelated workspace changes and the user-edited schema.dbdiagram.
Do not rename the branch, apply application migrations, deploy, or create a PR
without the corresponding user direction. Delete this plan folder when its PR lands.
See [verification and handoff](02-verification.md) for results and remaining work.
