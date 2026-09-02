# PresetTabs `trailing` slot + NotionToolbar decomposition

## Goal

`PresetTabs` owns its row and exposes a `trailing?: ReactNode` slot for
right-aligned content (marketplace row: future "Request a marketplace"
button; sold-band row: the toolbar icon cluster). `NotionToolbar` splits
into `NotionToolbarActions` (icon cluster) and `NotionToolbarChips`
(full-width chips row) so the cluster can be slot content while the chips
row stays full width. The two pieces share the chips-row visibility via
`ToolbarContext`.

`NotionToolbar` **stays** as the composition of the two pieces, so a view
without preset tabs keeps the one-line call site:

```tsx
<DataViewProvider controller={controller} properties={productProperties}>
  <NotionToolbar enableSettings />
  <TableView />
</DataViewProvider>
```

The Explore Listings gallery flattens to:

```tsx
<DataViewProvider …>
  <PresetTabs aria-label="Marketplace" mobileSelect={false} options={marketplacePresets} variant="line" />
  <PresetTabs options={scanListingsPresets} trailing={<NotionToolbarActions enableSettings />} />
  <NotionToolbarChips />
  <GalleryView … />
</DataViewProvider>
```

## Decisions (user-approved)

- Full decomposition: Actions + Chips as exported pieces; `NotionToolbar`
  kept as the composition for plain views (not just back-compat — it is
  the recommended call site when there are no preset rows).
- `useToolbarState` is **deleted**, not slimmed. Its only consumer is
  `toolbar.tsx`, it is not in the hooks barrel, and once visibility moves
  to context what remains is a thin wrapper over `analyzeFilter`.
- No marketplace-request button yet — just the slot.
- Both `NotionToolbarActions` and `NotionToolbarChips` carry the
  `dataViewSlot = "toolbar"` marker. Chips needs it (direct provider
  child). Actions gets it so a stray direct placement lands in the
  toolbar group instead of under the suspending query bridge.
- Chips-row toggle / auto-expand behavior must be identical to today —
  same state, context-backed.

## Non-goals

- Marketplace request button / "+ Connect" content.
- Any change to `PresetTabs` rendering when `trailing` is absent.
- Changes to `FilterTool`, `SortTool`, `SearchInput`, `SettingsTool`,
  `ChipsBar`.

## Done when

- `bun run check-types`, `bun run check`, `bun run test` pass (only the
  pre-existing `.context/inspect-encryption.mjs` lint errors are allowed).
- Manual, on Explore Listings:
  - Top-to-bottom: marketplace underline row → sold-band row with
    Filter/Sort/Search/Settings right-aligned on the same row → chips row
    when toggled → grid.
  - Filter/Sort icon toggles the chips row; adding a filter or sort
    auto-expands it; Reset clears filter + sort; settings panel opens.
  - Both tab rows derive active state and compose (eBay + 500–1000 sold
    in one `?filter=`).
  - Mobile width: sold band swaps to Select with the icon cluster still
    on the row; marketplace row stays scrollable tabs.
  - A `PresetTabs` without `trailing` is pixel-identical to today.
- `NotionToolbar` with no children still renders the same two-row layout.
- This folder is deleted in the PR.

## Files touched

All under `packages/dataview/src` unless noted.

| File | Change |
| --- | --- |
| `lib/providers/toolbar-context.tsx` | add `chipsRowVisible` / `setChipsRowVisible` / `toggleChipsRow` |
| `hooks/use-toolbar-state.ts` | **delete** |
| `components/toolbars/notion/toolbar-actions.tsx` | **new** — `NotionToolbarActions` |
| `components/toolbars/notion/toolbar-chips.tsx` | **new** — `NotionToolbarChips` |
| `components/toolbars/notion/toolbar.tsx` | becomes composition; re-exports the two pieces |
| `components/preset-tabs/index.tsx` | `trailing` slot |
| `apps/app/src/modules/explorer/data/scan-listings-gallery/index.tsx` | flatten |

`package.json` exports are unchanged: `./toolbars/notion` still points at
`toolbar.tsx`, which now re-exports `NotionToolbarActions` and
`NotionToolbarChips`.

## Conflicts

- `NotionToolbar` has exactly one consumer (the gallery) — verified by
  grep. `useToolbarState` has exactly one consumer (`toolbar.tsx`) and no
  tests — verified.
- `.agents/rules/architecture-module-folder-structure.md` mentions
  `<NotionToolbar>` as the optional toolbar for fetched views. Still true;
  no doc change needed.
