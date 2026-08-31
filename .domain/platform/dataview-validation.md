# DataView Internal Validation Architecture

## How filter/sort/search validation works today

### Two-layer pattern (client → server)

```
Client (dataview/validators)       Server (api/lib)
────────────────────────────       ────────────────
validate*(input, properties)       build*(table, validatedInput) → SQL
  → checks enableX flag
  → checks property type
  → strips invalid refs
  → returns input | null
```

Properties are a **client concern** — the server never imports property files. Validators derive what the server needs.

### Internal validation flow (filter & sort — the reference)

```
URL → QueryParamsProvider → validate() → QueryParamsState
  → QueryBridge → QueryRuntimeState
    → useGroupQuery / useInfiniteGroupQuery → dataQuery(validatedParams)
      → tRPC call
```

**Step 1: `QueryParamsProvider`** (`query-params-context.tsx:247`)
- Reads raw URL state via `nuqs`
- Calls `validate(input, properties)` which runs all validators:
  - `validateFilter(filter, properties)` → `WhereNode[] | null`
  - `validateSort(sort, properties)` → `SortQuery[]`
  - `validateGroup`, `validateColumn`, `validateCursors`, `validateLimit`
- **Search is NOT included** — raw `search` string bypasses `validate()` entirely
- Validated results stored in `QueryParamsState`

**Step 2: `QueryBridge`** (`query-bridge.tsx`)
- Reads from `QueryParamsState` (already validated)
- Passes validated filter/sort to `QueryRuntimeState.filter`/`.sort`
- Passes raw `search` string unchanged to `QueryRuntimeState.search`

**Step 3: Data query hooks** (`use-infinite-group-query.ts`, `use-group-query.ts`)
- Read filter/sort/search from `QueryRuntimeState`
- Pass to user's `dataQuery(params)`:
  - `params.filter` = validated `WhereNode[] | null` ✅
  - `params.sort` = validated `SortQuery[]` ✅
  - `params.search` = raw `string` ❌ (not validated)

**Step 4: Controller hooks** (`usePageController`, `useInfiniteController`)
- Do **NO validation** at all
- Purely wrap user's factory functions in stable refs (`useRef` + `useCallback`/`useMemo`)
- Just prevent unnecessary re-renders from factory recreation

### The gap: search bypasses internal validation

```
QueryParamsProvider
  validate({                    ← search NOT passed here
    filter: rawFilter,
    sort: rawSort,
    group: rawGroup,
    column: rawColumn,
    cursors: urlCursors,
    limit: urlLimit,
    // search: search,          ← MISSING
  })
  → { filter, sort, ... }      ← validated
  → search = raw string         ← NOT validated, used directly
```

Despite `validate()` in `validators/index.ts` already including `validateSearch()` (line 73), `QueryParamsProvider` never passes `search` to it. Each view component must manually call `validateSearch()` in its `dataQuery` factory.

---

## What's done (commit 6fe0c4f)

| Item | Status |
|------|--------|
| `validateSearch(search, properties) → ValidatedSearch \| null` | ✅ Done |
| `validate()` includes `search` in return | ✅ Done |
| Shared input schemas (`getManyInput`, etc.) in `api/src/lib/schemas.ts` | ✅ Done |
| Routers accept `search: { search, searchFields }.nullish()` | ✅ Done |
| Hardcoded search fields removed from routers | ✅ Done |
| View components call `validateSearch()` manually in `dataQuery` | ✅ Done (temporary) |

---

## Done: Search validation wired into controller internally

`params.search` in `dataQuery` now arrives as `ValidatedSearch | null` instead of `string`, matching how filter/sort work.

### Changes made

1. **`query-params-context.tsx`** — passes `search` to `validate()`, added `validatedSearch: ValidatedSearch | null` to `QueryParamsState` (raw `search: string` kept for toolbar UI)
2. **`pagination-controller.ts`** — changed `search: string` → `search: ValidatedSearch | null` in all 4 factory param types
3. **`use-page-controller.tsx`** — replaced inline types with imported `ColumnQueryOptionsFactory`/`GroupQueryOptionsFactory`
4. **`query-bridge.tsx`** — threads `validatedSearch` through `QueryRuntimeState.search`, `InfiniteGroupKeys`, `SuspendingColumnKeys`, and both bridge inner components; raw `search` kept for `DataViewProviderCore` (toolbar)
5. **`use-infinite-controller.tsx`** — already uses imported factory types, got the change automatically
6. **View components** — already pass `params.search` directly, now correctly typed as `ValidatedSearch | null`

---

## Pattern alignment summary

| Concern | Validator | enable flag | NON_X_TYPES | In `validate()` | Internal wiring | Status |
|---------|-----------|-------------|-------------|-----------------|-----------------|--------|
| Filter  | `validateFilter` | `enableFilter` | formula, button | ✅ | ✅ QueryParamsProvider | Done |
| Sort    | `validateSort` | `enableSort` | formula, button | ✅ | ✅ QueryParamsProvider | Done |
| Search  | `validateSearch` | `enableSearch` | formula, button, filesMedia, checkbox | ✅ | ✅ QueryParamsProvider | Done |
| Group   | `validateGroup` | `enableGroup` | formula, button, filesMedia | ✅ | ✅ QueryParamsProvider | Done |
