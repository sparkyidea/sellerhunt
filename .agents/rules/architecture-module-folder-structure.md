---
title: Module Folder Structure
impact: HIGH
tags: [architecture, modules, dataview]
---

## Module Folder Structure

**Impact: HIGH**

Each feature under `apps/app/src/modules/<feature>/` follows a fixed shape. Same shape for `listings`, `products`, `orders`, etc. — copy this layout when adding a new module so engineers (and agents) can find files without grepping.

### Minimum file tree

`<feature>` is the plural domain noun (`listings`, `products`, `orders`). The structure below is the canonical layout — see `apps/app/src/modules/listings/` as the reference implementation.

```
apps/app/src/modules/<feature>/
├── types.ts                   # tRPC-inferred domain types (e.g. ListingData)
├── components/                # feature-scoped cards/panels — composed by views
│   └── <feature>-<part>-card.tsx
├── data/                      # dataview folders (one per table/list/gallery)
│   ├── <feature>-presets.ts   # toolbar tab presets (filter/sort defaults)
│   └── <name>/                # see "Dataview folder structure" below
└── views/                     # page-level compositions, one folder per route
    └── <view-name>/
        ├── <view-name>-header.tsx
        ├── <view-name>-header-skeleton.tsx
        ├── <view-name>-body.tsx
        └── <view-name>-body-skeleton.tsx
```

Folder responsibilities:

| Folder        | Owns                                                                                            |
| ------------- | ----------------------------------------------------------------------------------------------- |
| `types.ts`    | Domain types inferred from `AppRouter` (`inferProcedureOutput`). Single source of truth.        |
| `components/` | Card/panel building blocks. Stateless or thin state wrappers. No data fetching from `data/*`.   |
| `data/`       | Dataview-driven tables, lists, galleries. Each subfolder is one view. Standard shape — see below. |
| `views/`      | Page-level header + body compositions. Pair every component with its `*-skeleton.tsx`.          |

**Out of scope for this rule:** `marketplace/` (per-channel adapters like `marketplace/ebay/`) is module-specific and not part of the standard shape. Don't generalize it.

### Dataview folder structure

Every folder under `<feature>/data/<name>/` follows the same shape. `<name>` is kebab-case and ends with the view kind: `-table`, `-list`, or `-gallery`.

```
<feature>/data/<name>/
├── index.tsx                  # public component — exports <Name>
├── <name>-properties.tsx      # property defs — exports <name>Properties (camelCase)
├── <name>-skeleton.tsx        # loading state — exports <Name>Skeleton
└── <name>-bulk-actions.tsx    # OPTIONAL — only paginated tables with bulk ops
```

Reference: `apps/app/src/modules/products/data/products-table/` (paginated table with bulk actions) and `apps/app/src/modules/listings/data/linked-product-list/` (simple list, no bulk actions).

#### File responsibilities

| File                       | Contains                                                                                            |
| -------------------------- | --------------------------------------------------------------------------------------------------- |
| `index.tsx`                | Controller (`usePageController` / `useInfiniteController`) **or** `SimpleDataViewProvider`, `<DataViewProvider>`, optional `<NotionToolbar>`, and the `<TableView>` / `<ListView>` / `<GalleryView>` element directly with its props (pagination, sticky header, `onRowClick` / `onItemClick` / `onCardClick`). Owns navigation via `useRouter`. Public component the rest of the app imports. |
| `<name>-properties.tsx`    | `DataViewProperty[]` array; row mappers (`toXRow`) for `Simple*` cases.                            |
| `<name>-skeleton.tsx`      | `<TableSkeleton>` / `<ListSkeleton>` / `<GallerySkeleton>` configured with the same properties.    |
| `<name>-bulk-actions.tsx`  | `BulkAction<Row>[]` — only when the table needs Export / Delete / etc.                              |

#### Why the leaf view is inlined in `index.tsx`

`<DataViewProvider>` reads static `dataViewType` / `defaultLimit` markers off its **direct child** to pick the right skeleton and default page size. Those markers live on `TableView` / `ListView` / `GalleryView` / `BoardView` themselves. Wrapping the leaf view in a function component (e.g. `export function ProductsTableView() { return <TableView .../> }`) hides the markers from detection and the provider throws at runtime. Keep the leaf view as a direct JSX child inside `index.tsx`.

#### Naming

| Item       | Convention            | Example                                  |
| ---------- | --------------------- | ---------------------------------------- |
| Folder     | `kebab-case`          | `linked-product-list`                    |
| Component  | `PascalCase`          | `LinkedProductList`                      |
| Properties | `camelCase`           | `linkedProductListProperties`            |
| Skeleton   | `<Name>Skeleton`      | `LinkedProductListSkeleton`              |

The `<Name>` (PascalCase folder name) is reused across `index` and `*-skeleton` exports for grep-ability.

### Skeleton lives in its own file

The skeleton **must** stay in `<name>-skeleton.tsx`. Don't re-export it from `index.tsx`. Pages that lazy-load the table via `dynamic()` import the skeleton eagerly as the `loading` fallback — if the skeleton came from `index`, the heavy table chunk would be pulled into the eager bundle and `dynamic()` is defeated.

**Incorrect:**

```tsx
// index.tsx
export { ProductsTable } from "./products-table";
export { ProductsTableSkeleton } from "./products-table-skeleton"; // re-export

// page.tsx — pulls in the entire ProductsTable graph just to render the loader
import { ProductsTableSkeleton } from "@/modules/products/data/products-table";
```

**Correct:**

```tsx
// page.tsx
import { ProductsTableSkeleton } from "@/modules/products/data/products-table/products-table-skeleton";

const ProductsTable = dynamic(
  () =>
    import("@/modules/products/data/products-table").then(
      (mod) => mod.ProductsTable
    ),
  { ssr: false, loading: () => <ProductsTableSkeleton /> }
);
```

### Bulk actions are table-only

Bulk actions ship only on paginated tables that need them (e.g. CSV export). Lists, galleries, and inline tables backed by `SimpleDataViewProvider` (variants on a listing, recent orders on a card) don't get a `*-bulk-actions.tsx` file. Today the only one is `products-table-bulk-actions.tsx`.

### When the data is passed in vs fetched

Two flavors of `index.tsx`, picked by where the data comes from:

- **Fetched** (paginated, server-side filter/sort/group) — use `usePageController` or `useInfiniteController` + `<DataViewProvider>` + `<NotionToolbar>`. Examples: `products-table`, `listings-gallery`.
- **Passed in** (already loaded as part of the parent record) — use `<SimpleDataViewProvider>` with `data` prop. No toolbar, no controller. Examples: `linked-product-list`, `listing-variants-table`, `recent-orders-list`.

In both cases the leaf view (`<TableView>` / `<ListView>` / `<GalleryView>`) is inlined as a direct JSX child of the provider.

Reference: `.agents/skills/dashseller-dataview/SKILL.md` for the dataview package internals and the `useQuery` vs `useSuspenseQuery` rule.
