# dashseller — Claude Code

Full rule index, build loop, and priority of truth: **`AGENTS.md`**.
Domain map: **`.domain/README.md`**. Vocabulary: **`.domain/glossary.md`**.

This file is loaded into every conversation, so it holds only what changes
behaviour *right now*. Everything else is one hop away and stays there.

---

## Before you edit: which rules govern this path

Changing **behaviour** in these paths means reading that domain's `rules.md`
first. CI (`check-domain-coverage.ts`) fails a diff touching them that neither cites
a rule id nor edits the rules file.

| Path | Domain | Rules |
| --- | --- | --- |
| `sync/src/orders/inventory.ts`, `db/src/schema/inventory.ts` | `inventory/` | `INV-001..008` |
| `sync/src/outbox/**`, `db/src/schema/sync-outbox.ts` | `sync/` | `SYN-001..007` |
| `sync/src/listings/**` | `sync/`, `listings/` | `SYN-005`, `LST-001..003` |
| `sync/src/orders/{relink,upsert-orders}.ts` | `orders/` | `ORD-001..004` |
| `sync/src/{shipments,tracking}/**`, `db/src/schema/{shipment,tracking}.ts` | `fulfillment/` | `FUL-001..010` |
| `marketplace/src/adapters/*/api/mapper/**` | `channels/` | `CHN-007` — **read [`terminology.md`](../.domain/channels/terminology.md) first** |
| `marketplace/src/adapters/*/auth/scopes.ts` | `channels/` | `CHN-001` |
| `marketplace/src/adapters/*/notification/**` | `channels/` | `CHN-002..006` |
| `db/src/schema/{category,marketplace-category}.ts` | `catalog/` | `CAT-001..004` |
| any business table, or a procedure touching one | `tenancy/` | `TEN-001..002` |

Writing or changing an **adapter mapper**? `.domain/channels/terminology.md` is
the vendor→our-model dictionary. Shopify `Product` is our `listing`, not our
`product`; our `product` has no marketplace counterpart.

These files already carry `Rule: XXX-NNN` in the docblock where the invariant
lives. **Read the surrounding comment before changing the line** — it usually
names the failure the rule prevents.

---

## Never

- **Never edit a rule to match code you just wrote.** If an implementation
  violates a rule, the implementation is wrong until a human says otherwise.
  Rewriting the spec to fit the code turns the rules into a mirror of whatever
  the code happens to do — the exact failure this system exists to prevent.
  Say what you hit, and stop.
- **Never invent, renumber, or reuse a rule id.** New rule = next unused number
  in that domain. Retired rule = `status: retired` plus a note, never deleted —
  source files reference the id.
- **Never resolve a conflict between sources silently.** Rule vs code, rule vs
  test, ADR vs rule — name both sides and where they diverge. Which one is wrong
  is a human decision.
- **Never run `drizzle-kit push` / `migrate`.** `bun db:generate` only, then
  stop and show the migration.
- **Never `git add` or `git commit`** without explicit permission.

---

## When you…

| …do this | …then |
| --- | --- |
| change behaviour in a guarded path | read that domain's `rules.md` **first**; if a rule's behaviour changes, the rule changes in the same PR |
| uphold a non-obvious invariant in code | cite it: `Rule: INV-003 — compare the lower bound` |
| add a new invariant | give it an id in `.domain/<domain>/rules.md`. A code comment alone is not a rule |
| find code and rule disagree | stop and report both sides; do not "fix" either |
| make a call with a real alternative | ADR in `.domain/decisions/`, next number, immutable once shipped |
| start a unit of work | `.plan/<slug>/` **on the branch**, never on `main` |
| finish a unit of work | delete `.plan/<slug>/`, then run both gates in `.github/scripts/` |
| need the backlog | GitHub Issues. Never a checked-in queue file |

`status: enforced` claims a rule is true **today** and cited by a test. If you
can't make that true, use `advisory` and say why — don't pretend.

---

## Commands

```bash
bun run check          # lint + format (ultracite)
bun run fix            # autofix
bun run check-types    # tsc across the monorepo
bun run test           # unit tests
bun db:generate        # migration only — never push/migrate

# the two domain gates — same commands CI runs, no package.json alias
bun .github/scripts/check-domain.ts           # ids, cited paths, tests
bun .github/scripts/check-domain-coverage.ts  # guarded code cites a rule
```

Needs `bun install` first — `node_modules` is not checked in.

---

## Also here

- `.agents/knowledge-base.md` — app topology, auth wiring, DB workflow.
- `.agents/rules/reference-file-locations.md` — where every package and route lives.
- `.agents/skills/` — `dashseller-dataview`, `dashseller-trpc`, `dashseller-db`,
  `dashseller-domain` (writing rules/ADRs) auto-load on matching work. Shared
  with other agent tools.
- `.claude/` — Claude-only: installed skills, slash commands, `settings.local.json`.
