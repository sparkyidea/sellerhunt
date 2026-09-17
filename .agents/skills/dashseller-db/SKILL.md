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
   If drizzle-kit's SQL would be wrong for the data (a type change it can only
   express as `SET DATA TYPE` over values that do not cast), keep the file it
   generated — its `meta/` snapshot and journal entry are what the next diff
   builds on — and replace the SQL body, with a header comment saying what was
   generated and why it was replaced. Never `generate --custom` for a schema
   change: it copies the previous snapshot. Never edit `meta/`.
3. **Stop.** Show the user the migration. Wait.
4. User runs `bun db:migrate` (or `db:push` for early dev) when ready.

## Where things live

```
packages/db/
  drizzle.config.ts             — reads DATABASE_URL from apps/api/.env
  src/
    index.ts                    — env-validated db singleton
    client.ts                   — env-free createDbClient(connectionString)
    testing.ts                  — migrateTestDb + TEST_DATABASE_URL
    schema/
      auth.ts                   — better-auth tables (user, session, account,
                                  verification, passkey, two_factor). No orgs.
      mobile-profile.ts         — scan persona pool (encrypted credentials/bearers)
      scan.ts                   — scan_config / scan_keyword / scan_seller /
                                  scan_listing (+ snapshot, variant)
    seed/
      scan.ts, mobile-profile.ts
    migrations/                 — GENERATED. Never edit meta/; a SQL body is
                                  replaced by hand only per the rule above.
```

## Schema conventions

- One file per entity (or tightly-related cluster).
- Relations defined alongside the entity table.
- Scan tables are **not** FK-linked to any auth table; `marketplace` is a plain
  text discriminator and `category` a stored text path — the explorer stack is
  intentionally standalone.
- Don't put business logic in schema files — schema is structural only.

## Querying

- The `scanListing` router is `publicProcedure` — scan reads need no session.
- Repository-style helpers belong in `packages/trpc/src/routers/<entity>.ts`,
  not in the schema package.

## See also

- `.agents/knowledge-base.md` — "Database operations".
- `.agents/rules/reference-generated-files.md` — generated paths to avoid editing.
