# Agent Instructions

This file is the entry point for any AI coding agent (Codex, Cursor, Aider, etc.) working in the dashseller repo. Claude Code also loads it via `.claude/CLAUDE.md`.

The actual content lives in **`.agents/`** — a single source of truth shared across all agent tools. This file points you there.

## Three context directories, split by lifetime

| Directory  | Lives for                 | Answers                          |
| ---------- | ------------------------- | -------------------------------- |
| `.agents/` | until conventions change  | *How do we write code here?*     |
| `.domain/` | until the product changes | *What are we building, and why?* |
| `.plan/`   | **one PR**                | *What am I building right now?*  |

## Priority of truth

| # | Source                     | Where                                          |
| - | -------------------------- | ---------------------------------------------- |
| 1 | **Domain rules**           | `.domain/<domain>/rules.md` — the `XXX-NNN` set |
| 2 | **Architecture decisions** | `.domain/decisions/NNNN-*.md`                   |
| 3 | **Automated tests**        | the `tests:` paths each rule cites              |
| 4 | **Application code**       | `apps/`, `packages/`                            |
| 5 | **Prose docs and examples**| everything else                                 |

**If sources disagree, do not invent a resolution. Flag the conflict.** A rule
contradicting the code means one of them is a bug, and which one is a decision
for a human. Say plainly which two sources disagree and where.

## Read first

1. **`.domain/README.md`** — the map and the rules for keeping it true. Then
   **`.domain/glossary.md`** for vocabulary and **`.domain/decisions/`** for why
   things are the way they are.
2. **`.agents/knowledge-base.md`** — app topology, auth wiring, data-access
   patterns, DB workflow.
3. **`.agents/rules/reference-file-locations.md`** — where every package and
   route lives.

## The build loop

Domain specification changes **before** implementation, not after.

1. **Capture** → GitHub Issue (the backlog is Issues, never a checked-in file)
2. **Identify the rule** → which `XXX-NNN` does this change? If none exists and
   the change adds an invariant, write the rule first.
3. **Plan** → new worktree + branch, write `.plan/<slug>/`
4. **Update the rule** → if behaviour changes, the rule changes here
5. **Update tests** → the rule's `tests:` paths are what prove it
6. **Implement**
7. **Land** → PR = code **+** rule/`.domain/` update **+** `rm -r .plan/<slug>/`
8. **Decide** → real alternative considered? Add `.domain/decisions/NNNN-*.md`

**R1** Docs change in the PR that makes them true — never a follow-up doc PR.
**R2** A plan file that outlives its PR is a bug.
**R3** One fact, one home. Link, don't copy.
**R6** Flag conflicts; never resolve them silently.

## Domain rules and traceability

Every invariant has a permanent id — `INV-003`, `FUL-002`, `SYN-005` — that
code comments, tests, commits, and PRs reference. This is what connects
requirement ↔ rule ↔ test ↔ implementation when AI writes most of the code.

```bash
# ids unique, cited paths exist, critical rules tested, and no source file
# references a rule that no longer exists
bun .github/scripts/check-domain.ts

# guarded code changed => diff cites a rule id or edits rules.md
bun .github/scripts/check-domain-coverage.ts
```

Both run in CI as the `domain` job. When you uphold a non-obvious invariant in
code, cite it: `// INV-003: compare the lower bound, not a midpoint`.

**Rule ids are permanent.** Never renumber, never reuse a retired one.

See `.plan/README.md` for why the plan folder is created on the branch (it is
what makes parallel worktrees conflict-free).

## Rules (in `.agents/rules/`)

| File                                  | When it applies                                                           |
| ------------------------------------- | ------------------------------------------------------------------------- |
| `architecture-dependency-layers.md`   | Adding/changing imports between `@dashseller/*` packages. **Critical.**   |
| `architecture-feature-organization.md`| Adding a new feature; deciding what package code lives in.                |
| `architecture-env-validation-boundaries.md` | Touching `packages/env/` or importing env from a deployment package. Prevents redundant validators + boot-graph leaks. |
| `quality-code-standards.md`           | All TypeScript code. Ultracite/Biome enforcement.                         |
| `quality-react.md`                    | Any React component or hook.                                              |
| `quality-async.md`                    | Promises and async functions.                                             |
| `quality-security.md`                 | User input boundaries, auth code, links, dangerous APIs.                  |
| `quality-performance.md`              | Loops, regex, imports, images, bundle considerations.                     |
| `quality-testing.md`                  | Vitest test files.                                                        |
| `quality-pr-creation.md`              | Opening or sizing a PR. Conventional Commits, <500 LOC cap.               |
| `patterns-adapter-package.md`         | Adapter package env boundary — env-imports allowed in `src/index.ts` only, adapter folders stay pure. Sandbox isolation. |
| `patterns-adapter-package-structure.md` | Adapter package layout, naming, `index.ts` discipline, `http.ts` vs `create-<vendor>-client.ts`, factory signature choice. |
| `patterns-adapter-auth.md`            | Three auth patterns (Static / OAuth refresh / Bearer provider). Factory signature per pattern, `TokenResult` shape, when to use which. |
| `data-adapter-token-storage.md`       | Token table conventions — `<resource>_token` (OAuth) vs `<resource>_profile` (persona pool). Decision tree + column rules + TokenManager loop. |
| `patterns-trpc-getone-fetching.md`    | Shaping a tRPC `getOne` — join 1:1 FK relations; separate query for lists.|
| `patterns-panel-structure.md`         | Building list / detail / preview panels — `Panel*` primitives, wrapper-plus-presentational split, skeletons. |
| `patterns-figma-implementation.md`    | Translating a Figma frame into code — MCP flow, primitive reuse, token mapping. |
| `ci-local-checks.md`                  | Before pushing. Type check + Biome + tests order.                         |
| `reference-file-locations.md`         | "Where does X live?" lookup.                                              |
| `reference-generated-files.md`        | Anything looking like generated code; DB migration workflow.              |
| `culture-leverage-ai.md`              | Deciding scope of an AI-drafted change vs. asking the human.              |

See `.agents/rules/_sections.md` for the rule namespacing convention and `.agents/rules/_template.md` to add a new rule.

## Project skills (in `.agents/skills/`)

Vendor-neutral, auto-loaded on demand by any compatible agent tool:

- **`dashseller-dataview`** — table/list/pagination work.
- **`dashseller-trpc`** — adding or calling tRPC procedures.
- **`dashseller-db`** — schema, migrations, drizzle queries (enforces no-push-without-approval).
- **`dashseller-domain`** — writing, changing, or retiring `.domain/` knowledge: rules, ADRs, where a fact belongs.

## Domain reference (in `.domain/`)

Organized by business domain. Each owns a permanent rule-ID prefix.

| Domain         | Prefix | When it applies                                            |
| -------------- | ------ | ----------------------------------------------------------- |
| `tenancy/`     | `TEN`  | Anything touching isolation or `organizationId`.            |
| `catalog/`     | `CAT`  | Product, variant, warehouse, category taxonomy.             |
| `channels/`    | `CHN`  | OAuth scopes, webhooks, per-marketplace behaviour. **`terminology.md` is the vendor→our-model dictionary — read before writing any adapter mapper.** |
| `listings/`    | `LST`  | Listings and the channel↔catalog join.                      |
| `orders/`      | `ORD`  | Orders, lines, relink, windowed pulls.                      |
| `inventory/`   | `INV`  | Stock semantics and seeding. **The hardest rules.**         |
| `fulfillment/` | `FUL`  | Shipments, correlation, tracking.                           |
| `sync/`        | `SYN`  | The outbox write path. **`sync/outbox.md` is required reading.** |

| Supporting     | When it applies                                                      |
| -------------- | ---------------------------------------------------------------------- |
| `glossary.md`  | Any time two terms might mean the same thing. They usually don't.      |
| `product.md`   | What the seller does; the constraints shaping feature decisions.       |
| `decisions/`   | Before re-litigating an architectural call. Immutable once shipped.    |
| `platform/`    | Search, dataview validation — mechanism with no domain semantics.      |
| `research/`    | Competitor teardowns, vendor policy reference. Not our design.         |

**Knowledge vs live state:** this directory holds what things *mean*. It never
holds what any specific customer, order, or channel currently *is* — that comes
from tRPC procedures and DB queries.

## Quick commands

- Format: `bun x ultracite fix`
- Check: `bun x ultracite check`
- Type check: `bun check-types`
- Dev (all): `bun dev`
- Dev (single app): `bun x turbo -F <app> dev` (web, app, api, worker)
- DB generate migration: `bun db:generate` (**never** push/migrate without user approval — see knowledge-base)
- Trigger.dev dev: `bun trigger:sync:dev` (cloud) / `bun trigger:scan:dev` (self-hosted)
- Trigger.dev deploy: `bun trigger:sync:deploy` / `bun trigger:scan:deploy`
