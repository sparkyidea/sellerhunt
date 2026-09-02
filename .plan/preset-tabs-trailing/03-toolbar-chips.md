# Step 3 — `components/toolbars/notion/toolbar-chips.tsx`

New component `NotionToolbarChips`: the full-width chips row.

## Props

```ts
interface NotionToolbarChipsProps {
  className?: string;
  properties?: readonly PropertyMeta[];
}
```

## Body

- `useFilterParams` (`filter`, `setFilter`, `resetFilter`), `useSortParams`
  (`sort`, `resetSort`), `chipsRowVisible` / `setChipsRowVisible` from
  `useToolbarContext()`, `properties` as in Actions.
- `filterAnalysis = useMemo(() => analyzeFilter(filter), [filter])`.
- `hasActiveControls = (filter !== null && filter.length > 0) || sorts.length > 0`.
- Auto-expand effect moves here, unchanged in behavior:
  ```ts
  const controlCount = (filter?.length ?? 0) + sorts.length;
  const prev = useRef(controlCount);
  useEffect(() => {
    if (controlCount > prev.current) setChipsRowVisible(true);
    prev.current = controlCount;
  }, [controlCount, setChipsRowVisible]);
  ```
- Render `null` unless `hasActiveControls && chipsRowVisible`. Otherwise a
  fragment (or `div` with `className` when provided) containing
  `<Separator orientation="horizontal" />` + `<ChipsBar …>` with the exact
  prop wiring from today's `toolbar.tsx`, including
  `onReset={() => { resetFilter(); resetSort(); }}`.
- Static marker + cast export: `dataViewSlot = "toolbar"`, so it can be a
  direct `DataViewProvider` child and render in JSX order with the tab rows.

Returning `null` when collapsed means the provider's `gap-2` between
siblings collapses too — no stray gap under the sold band.
