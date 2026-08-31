---
name: dashseller-dataview
description: Use when building or modifying tables, lists, paginated views, or filterable views in the dashseller app. Triggers on "dataview", "table", "pagination", "cursor", "filter", "grouping", "rollup", or any work touching `packages/dataview/` or table-style routes in `apps/app`.
---

# Dashseller Dataview

`@dashseller/dataview` is a domain-specific query+display abstraction. It is **not** a thin wrapper around `@tanstack/react-table` — it owns filtering, cursor pagination, grouping, and rollups, and is tightly coupled to tRPC router inputs.

## Core rule: useQuery vs useSuspenseQuery

- **Page-level fetch** → `useQuery`. Lets the page render its own loading skeleton.
- **Inside dataview tables** → `useSuspenseQuery`. The Suspense boundary keeps the previous page mounted while the next loads — pagination stays smooth.

Flipping these breaks UX:
- `useSuspenseQuery` at page level → no skeleton, blank screen on load.
- `useQuery` in dataview → flicker between pages.

## Where things live

```
packages/dataview/src/
  components/
    views/        — table, list, board view components
    toolbars/     — filter/sort/group toolbar UI
    skeletons/    — loading states
    ui/           — internal primitives
  hooks/          — dataview-specific React hooks
  parsers/        — input → query shape
  validators/     — Zod schemas (WhereNode, cursor)
  types/          — shared types
```

tRPC routers consume the dataview validators directly — see `packages/trpc/src/routers/listing.ts` and `order.ts` for examples.

## Adding a new table view

1. Look at the closest existing view in `packages/dataview/src/components/views/`. Copy its pattern.
2. Define the row + cell components alongside the route in `apps/app/src/app/(app)/<feature>/`.
3. The tRPC procedure accepts the dataview filter/cursor inputs — reuse existing input schemas from `packages/dataview/src/validators/`.
4. Wire the table with `useSuspenseQuery`.
5. The page wrapping the table uses `useQuery` for any sibling data, with `<Suspense>` around the table.

## Things to avoid

- Don't reach for raw `@tanstack/react-table` — use dataview views.
- Don't add per-route filter logic; extend dataview parsers/validators.
- Don't paginate by offset; cursors only.

## See also

- `.agents/knowledge-base.md` — "Dataview package" and "tRPC + React Query patterns" sections.
- `.agents/rules/reference-file-locations.md` — full path index.
