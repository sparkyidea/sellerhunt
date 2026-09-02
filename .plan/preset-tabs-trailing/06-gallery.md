# Step 6 — flatten `apps/app/src/modules/explorer/data/scan-listings-gallery/index.tsx`

```tsx
import {
  NotionToolbarActions,
  NotionToolbarChips,
} from "@sparkyidea/dataview/toolbars/notion";
…
<DataViewProvider …>
  <PresetTabs
    aria-label="Marketplace"
    mobileSelect={false}
    options={marketplacePresets}
    variant="line"
  />
  <PresetTabs
    options={scanListingsPresets}
    trailing={<NotionToolbarActions enableSettings />}
  />
  <NotionToolbarChips />
  <GalleryView … />
</DataViewProvider>
```

- Drop the `NotionToolbar` import.
- Marketplace row's `trailing` stays empty for now.

# Step 7 — verify

1. `bun run check-types && bun run check && bun run test`.
2. Manual checklist in `00-overview.md` → *Done when*.
3. `rm -r .plan/preset-tabs-trailing` in the PR.
