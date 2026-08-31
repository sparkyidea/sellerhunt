# dashseller — Claude Code (SellerHunt / Explorer)

This repo is the **Explorer** stack split out of the original dashseller:
competitor-listing scanning and product research over *unofficial*
marketplace data (eBay/shop scraping). There is no official-marketplace
integration and no multichannel management here — orders, listings sync,
shipments, inventory, channels, and organizations were all removed.

(Package scopes stay `@dashseller/*`; the dashseller → sellerhunt rename is a
separate later task.)

Topology, conventions, build loop: **`AGENTS.md`**.
App orientation: **`.agents/knowledge-base.md`**.
Where things live: **`.agents/rules/reference-file-locations.md`**.

This file is loaded into every conversation, so it holds only what changes
behaviour *right now*. Everything else is one hop away.

---

## Never

- **Never run `drizzle-kit push` / `migrate`.** `bun db:generate` only, then
  stop and show the migration.
- **Never `git add` or `git commit`** without explicit permission.

---

## When you…

| …do this | …then |
| --- | --- |
| change the DB schema | edit `packages/db/src/schema/*.ts`, run `bun db:generate`, then stop and **show** the migration — never push/migrate |
| start a unit of work | `.plan/<slug>/` **on the branch**, never on `main` |
| finish a unit of work | delete `.plan/<slug>/` |
| need the backlog | GitHub Issues. Never a checked-in queue file |

---

## Commands

```bash
bun run check          # lint + format (ultracite)
bun run fix            # autofix
bun run check-types    # tsc across the monorepo
bun run test           # unit tests
bun db:generate        # migration only — never push/migrate
```

Needs `bun install` first — `node_modules` is not checked in.

---

## Also here

- `.agents/knowledge-base.md` — app topology, auth wiring, DB workflow.
- `.agents/rules/reference-file-locations.md` — where every package and route lives.
- `.agents/skills/` — `dashseller-dataview`, `dashseller-trpc`, `dashseller-db`
  auto-load on matching work. Shared with other agent tools.
- `.claude/` — Claude-only: installed skills, slash commands, `settings.local.json`.
