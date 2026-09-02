# Step 4 — `components/toolbars/notion/toolbar.tsx` becomes the composition

Props and rendered layout for existing call sites are unchanged.

```tsx
function NotionToolbarComponent({
  children, className,
  columnProperty, enableColumn, enableFilter, enableSearch, enableSettings,
  enableSort, groupProperty, properties,
  ...props
}: NotionToolbarProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)} {...props}>
      <div className="flex h-9 items-center gap-2">
        {children && <div className="flex flex-1 gap-2">{children}</div>}
        <NotionToolbarActions
          className="ml-auto"
          columnProperty={columnProperty} enableColumn={enableColumn}
          enableFilter={enableFilter} enableSearch={enableSearch}
          enableSettings={enableSettings} enableSort={enableSort}
          groupProperty={groupProperty} properties={properties}
        />
      </div>
      <NotionToolbarChips properties={properties} />
    </div>
  );
}
```

- The outer div drops `role="toolbar"` / `aria-orientation`: the landmark
  now lives on `NotionToolbarActions`, which is where the controls are.
  Avoids a nested toolbar landmark.
- Drop the imports of `useFilterParams`, `useSearchParams`,
  `useSortParams`, `useToolbarState`, `useQueryParamsState`, `Separator`,
  `ChipsBar`, `FilterTool`, `SortTool`, `SettingsTool`, `SearchInput`, and
  the helper functions (all moved).
- Keep `dataViewSlot` marker + cast export.
- Re-export so the app imports everything from the existing
  `@sparkyidea/dataview/toolbars/notion` path:
  ```ts
  export { NotionToolbarActions } from "./toolbar-actions";
  export type { NotionToolbarActionsProps } from "./toolbar-actions";
  export { NotionToolbarChips } from "./toolbar-chips";
  export type { NotionToolbarChipsProps } from "./toolbar-chips";
  ```
  (Biome's barrel-file rule: this is a re-export from the public entry
  file; add a `biome-ignore` only if `bun run check` complains.)
- Update the JSDoc example to show both call sites (plain
  `<NotionToolbar />` and the flat form with `PresetTabs trailing`).
