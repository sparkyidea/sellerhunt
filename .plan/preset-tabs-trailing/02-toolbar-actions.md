# Step 2 — `components/toolbars/notion/toolbar-actions.tsx`

New component `NotionToolbarActions`: the right icon cluster, extracted
verbatim from today's `toolbar.tsx` row-1 right side.

## Props

```ts
interface NotionToolbarActionsProps {
  "aria-label"?: string;        // default "View controls"
  className?: string;
  columnProperty?: string;
  enableColumn?: boolean;       // default false
  enableFilter?: boolean;       // default true
  enableSearch?: boolean;       // default true
  enableSettings?: boolean;     // default false
  enableSort?: boolean;         // default true
  groupProperty?: string;
  properties?: readonly PropertyMeta[];
}
```

## Body

- Move `getGroupPropertyId` / `getColumnPropertyId` and the two derived-name
  IIFEs here unchanged.
- `properties = propProperties ?? ctx?.properties ?? []` via
  `useToolbarContextOptional`; `queryParams` via `useQueryParamsState`;
  `shouldEnableColumn = enableColumn || queryParams.column != null`.
- `FilterTool` / `SortTool` `onToggle` → `toggleChipsRow` from
  `useToolbarContext()` (required — Actions is meaningless outside the
  provider).
- `SearchInput` wired to `useSearchParams` as today.
- `SettingsTool` unchanged.
- Container: `<div aria-label aria-orientation="horizontal"
  className={cn("flex items-center", className)} role="toolbar">`.
  No `ml-auto`, no height — alignment and row height are the host's job
  (`NotionToolbar` row 1, or the `PresetTabs` trailing container).
- Static marker + cast export, same shape as `NotionToolbar`:
  `NotionToolbarActionsComponent.dataViewSlot = "toolbar" as const`.
- JSDoc must say: pairs with `<NotionToolbarChips />`; without it the
  Filter/Sort toggles have nothing to expand. Point plain views at
  `<NotionToolbar />` instead.
