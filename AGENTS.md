# Agent Instructions

Entry point for any AI coding agent (Claude Code, Codex, Cursor, Aider, …)
working in this repo. Claude Code also loads it via `.claude/CLAUDE.md`.

This repo is the **Explorer** stack split out of the original dashseller:
competitor-listing scanning and product research over *unofficial* marketplace
data. Multichannel management (orders, listings sync, shipments, inventory,
channels, organizations) and the official-marketplace integrations were removed
in the SellerHunt split. Package scopes remain `@dashseller/*` (the rename to
`sellerhunt` is a separate later task).

The conventions live in **`.agents/`** — a single source of truth shared across
all agent tools. This file points you there.

## Two context directories, split by lifetime

| Directory  | Lives for                | Answers                        |
| ---------- | ------------------------ | ------------------------------ |
| `.agents/` | until conventions change | *How do we write code here?*   |
| `.plan/`   | **one PR**               | *What am I building right now?* |

## Priority of truth

| # | Source                      | Where                            |
| - | --------------------------- | -------------------------------- |
| 1 | **Automated tests**         | `*.test.ts(x)`                   |
| 2 | **Application code**        | `apps/`, `packages/`             |
| 3 | **Prose docs and examples** | everything else                  |

**If sources disagree, do not invent a resolution. Flag the conflict.** A test
contradicting the code means one of them is a bug, and which one is a decision
for a human. Say plainly which two sources disagree and where.

## Read first

1. **`.agents/knowledge-base.md`** — app topology, auth wiring, data-access
   patterns, DB workflow.
2. **`.agents/rules/reference-file-locations.md`** — where every package and
   route lives.

## The build loop

1. **Capture** → GitHub Issue (the backlog is Issues, never a checked-in file).
2. **Plan** → new branch, write `.plan/<slug>/`.
3. **Implement** — schema change? `bun db:generate`, then stop and show the
   migration (never push/migrate without approval).
4. **Prove it** → tests for the behaviour you changed.
5. **Land** → PR **+** `rm -r .plan/<slug>/`.

**R1** Docs change in the PR that makes them true — never a follow-up doc PR.
**R2** A plan file that outlives its PR is a bug.
**R3** One fact, one home. Link, don't copy.
**R6** Flag conflicts; never resolve them silently.

## Rules (in `.agents/rules/`)

| File                                  | When it applies                                                           |
| ------------------------------------- | ------------------------------------------------------------------------- |
| `architecture-dependency-layers.md`   | Adding/changing imports between `@dashseller/*` packages. **Critical.**   |
| `architecture-feature-organization.md`| Adding a new feature; deciding what package code lives in.                |
| `architecture-env-validation-boundaries.md` | Touching `packages/env/` or importing env from a deployment package. |
| `quality-code-standards.md`           | All TypeScript code. Ultracite/Biome enforcement.                         |
| `quality-react.md`                    | Any React component or hook.                                              |
| `quality-async.md`                    | Promises and async functions.                                            |
| `quality-security.md`                 | User input boundaries, auth code, links, dangerous APIs.                  |
| `quality-performance.md`              | Loops, regex, imports, images, bundle considerations.                     |
| `quality-testing.md`                  | Vitest / `bun:test` test files.                                          |
| `quality-pr-creation.md`              | Opening or sizing a PR. Conventional Commits, <500 LOC cap.               |
| `patterns-adapter-package.md`         | Adapter package env boundary (applies to `@dashseller/marketplace-scan`). |
| `patterns-adapter-package-structure.md` | Adapter package layout, naming, `index.ts` discipline.                 |
| `patterns-adapter-auth.md`            | Adapter auth patterns (Static / OAuth refresh / Bearer provider).         |
| `data-adapter-token-storage.md`       | Token/persona table conventions (`mobile_profile` persona pool).          |
| `patterns-trpc-getone-fetching.md`    | Shaping a tRPC `getOne` — join 1:1 FK relations; separate query for lists.|
| `patterns-panel-structure.md`         | Building list / detail / preview panels with the `Panel*` primitives.     |
| `patterns-figma-implementation.md`    | Translating a Figma frame into code.                                      |
| `ci-local-checks.md`                  | Before pushing. Type check + Biome + tests order.                         |
| `reference-file-locations.md`         | "Where does X live?" lookup.                                              |
| `reference-generated-files.md`        | Anything looking like generated code; DB migration workflow.              |
| `culture-leverage-ai.md`              | Deciding scope of an AI-drafted change vs. asking the human.              |

Some rule *examples* still reference the pre-split codebase (orders, listings,
sync). The conventions hold; the examples are illustrative. See
`.agents/rules/_sections.md` for namespacing and `_template.md` to add a rule.

## Project skills (in `.agents/skills/`)

Vendor-neutral, auto-loaded on demand by any compatible agent tool:

- **`dashseller-dataview`** — table/list/pagination work.
- **`dashseller-trpc`** — adding or calling tRPC procedures.
- **`dashseller-db`** — schema, migrations, drizzle queries (enforces no-push-without-approval).

## Quick commands

- Format: `bun run fix` · Check: `bun run check`
- Type check: `bun run check-types`
- Dev (all): `bun dev`
- Dev (single app): `bun x turbo -F <app> dev` (app, api)
- DB generate migration: `bun db:generate` (**never** push/migrate without user approval)
- Trigger.dev (scan, self-hosted): `bun trigger-scan:dev` / `bun trigger-scan:deploy`
