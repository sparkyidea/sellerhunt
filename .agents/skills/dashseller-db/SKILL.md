---
name: dashseller-db
description: Use when modifying the database schema, generating migrations, writing drizzle queries, or anything touching `packages/db/`. Triggers on "schema", "migration", "drizzle", "db:generate", "db:push", "db:migrate", or table/column changes.
---

# Dashseller Database

ORM: **drizzle-orm** v0.45 over **Postgres**.

## Critical rule

**Never run `bun db:push` or `bun db:migrate` without explicit user approval.** Generate the migration, show it to the user, let the user apply.

Why: a bad push is irreversible on shared environments and can lose data.

Workflow:

1. Edit a schema file in `packages/db/src/schema/<entity>.ts`.
2. Run `bun db:generate` — produces a new file in `packages/db/src/migrations/`.
3. **Stop.** Show the user the migration. Wait.
4. User runs `bun db:migrate` (or `db:push` for early dev) when ready.

## Where things live

```
packages/db/
  drizzle.config.ts             — reads DATABASE_URL from apps/api/.env
  src/
    index.ts                    — db client export
    schema/
      auth.ts                   — better-auth tables
      category.ts
      channel.ts
      channel-sync-state.ts
      inventory.ts
      issue.ts
      listing.ts
      marketplace.ts
      marketplace-category.ts
      order.ts
      product.ts
      return.ts
      setting.ts
      shipment.ts
      shipment-relations.ts
      sync-outbox.ts
      tax-rate.ts
      tracking.ts
      warehouse.ts
      webhook.ts
      world.ts
    migrations/                 — GENERATED. Don't hand-edit.
```

## Schema conventions

- One file per entity (or tightly-related cluster).
- Business tables carry `organizationId` — the organization is the tenant. `createdByUserId` is attribution only, never isolation. See rule `TEN-001` in `.domain/tenancy/rules.md`.
- Relations defined alongside the entity table.
- Composite indexes on business tables lead with `organization_id` (`TEN-002`).
- Outbox pattern (`sync-outbox.ts`) for eventual consistency between local DB and marketplace state — see `.domain/sync/outbox.md` and rules `SYN-001..003`.

## Querying

- All queries scope by `ctx.organizationId` via `orgProcedure` — never `ctx.user.id`. See `TEN-001`.
- Repository-style helpers belong in `packages/trpc/src/routers/<entity>.ts`, not in the schema package.
- Don't put business logic in schema files — schema is structural only.

## See also

- `.domain/tenancy/rules.md` — isolation invariants (`TEN-001`, `TEN-002`).
- `.agents/skills/dashseller-domain` — writing domain rules for schema invariants.
- `.agents/knowledge-base.md` — "Database operations".
- `.agents/rules/reference-generated-files.md` — generated paths to avoid editing.
