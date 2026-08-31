# Rule Section Prefixes

Each rule file in `.agents/rules/` is namespaced by one of these prefixes. Keep one prefix per file; split files when a rule grows beyond a single concern.

| Prefix         | Scope                                                                 |
| -------------- | --------------------------------------------------------------------- |
| `architecture-`| Package layering, dependency direction, module boundaries.            |
| `quality-`     | Code style, type safety, React patterns, performance, security.       |
| `data-`        | Drizzle schema conventions, migrations, query patterns.               |
| `patterns-`    | Repeating implementation patterns (tRPC procedures, dataview, sync).  |
| `reference-`   | Lookup tables — file locations, env vars, generated paths.            |
| `ci-`          | Pre-push checks, CI workflow expectations, release process.           |
| `culture-`     | What humans own vs what AI drafts; review norms.                      |

## Naming

`<prefix>-<short-kebab-name>.md` — e.g. `architecture-dependency-layers.md`, `patterns-trpc-procedure.md`.
