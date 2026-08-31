# Tenancy rules

The **organization is the tenant.** One org is auto-created per user at signup.

---

### TEN-001 — Business data is scoped by `organizationId`, never `userId`

```yaml
id: TEN-001
severity: critical
status: enforced
code:
  - packages/trpc/src/index.ts
  - packages/db/src/schema/channel.ts
tests:
  - packages/sync/src/channels/__tests__/disconnect.integration.test.ts
```

**Rule.** Every business table carries `organizationId` and every query filters
on it. `orgProcedure` enforces the scope in tRPC. `createdByUserId` is
**attribution only** — it must never appear in an isolation predicate.

**Why.** Cross-tenant data exposure. A query scoped by `userId` returns nothing
for a second member of the same org, and — worse — a query that forgets to scope
at all returns every org's rows.

**Violating looks like.** `where(eq(table.createdByUserId, ctx.session.user.id))`
as an access check. A new business table without `organizationId`. A procedure
built on the base `protectedProcedure` when it touches business data.

---

### TEN-002 — New business tables index `organizationId` first

```yaml
id: TEN-002
severity: high
status: enforced
code:
  - packages/db/src/schema/channel.ts
tests:
  - packages/db/src/__tests__/migrations.integration.test.ts
```

**Rule.** Because every read filters on it, composite indexes on business tables
lead with `organization_id`.

**Why.** An index that doesn't lead with the always-present predicate isn't used
for it. At multi-tenant row counts this is the difference between an index scan
and a sequential one.

**Violating looks like.** A composite index on `(status, created_at)` with no
`organization_id` prefix.
