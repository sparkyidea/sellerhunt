# Step 1 — chips-row visibility into ToolbarContext; delete useToolbarState

## `lib/providers/toolbar-context.tsx`

Add to `ToolbarContextValue`:

```ts
/** Whether the chips row (filter chips + sort list) is expanded */
chipsRowVisible: boolean;
/** Set chips-row visibility */
setChipsRowVisible: (visible: boolean) => void;
/** Toggle chips-row visibility */
toggleChipsRow: () => void;
```

In `ToolbarContextProvider`: `const [chipsRowVisible, setChipsRowVisible] =
useState(false)`, `toggleChipsRow = useCallback(() => setChipsRowVisible(p
=> !p), [])`, add all three to the memoized value and its deps.

This provider already wraps every toolbar-slot child inside
`DataViewProvider` (`data-view-provider.tsx`, `ToolbarContextProvider`
around `{toolbarChildren}`), so Actions inside a `PresetTabs` `trailing`
slot and a sibling Chips share the same boolean.

## `hooks/use-toolbar-state.ts`

Delete the file. Its filter analysis (`analyzeFilter` from
`utils/filter-builder`) is called directly in `NotionToolbarChips`
(step 3). `needsNormalization` was never consumed — drop it.
