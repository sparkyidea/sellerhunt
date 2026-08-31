---
title: Panel Structure (List + Detail + Preview)
impact: HIGH
tags: [patterns, layout, panel, detail-page, preview-pane]
---

## Panel Structure

**Impact: HIGH**

The canonical implementation lives in the `listings` module. Every other entity
module (`shipments`, `orders`, `products`, `explorer/listings`, `issues`,
`inventory`, …) should follow the same shape so that close/expand affordances,
sticky toolbars, header chrome, breadcrumbs, prev/next navigation, skeleton
shape, and horizontal padding stay consistent.

- Primitives: `packages/ui/src/components/panel.tsx`
- List + side-preview page: `apps/app/src/app/(app)/listings/page.tsx`
- Route detail page: `apps/app/src/app/(app)/listings/[listingId]/page.tsx`
- Shared panel components: `apps/app/src/modules/listings/views/listing/listing-panel.tsx`
- Matching skeletons: `apps/app/src/modules/listings/views/listing/listing-panel-skeleton.tsx`

---

### 1. Mental model

There are **three** surfaces, assembled from the same primitives:

| Surface | Where it lives | Lifecycle |
|---|---|---|
| **List view** | `app/(app)/<entity>/page.tsx` | Client page, owns selection state |
| **Side preview** | rendered inside the list page, second `PanelProvider` | Mounts/animates on `selectedId` |
| **Route detail** | `app/(app)/<entity>/[id]/page.tsx` | RSC, `prefetch` + `HydrateClient` |

The side preview and the route detail render the **same body component** with
different header chrome (toolbar vs breadcrumb). They share the tRPC cache
because they call the same query.

---

### 2. Primitives reference

From `@sparkyidea/ui/components/panel`:

- `PanelProvider` — outer container. Controls open/close (`open`),
  resize handle (`resizable`), URL identity (`id`), and close callback
  (`onClose`). Two siblings sit side-by-side; the **second** one is the
  collapsible preview.
- `Panel` — inner scroll container. `max-w-240 mx-auto py-4`. Use
  `className="max-w-none"` on a list page that needs full width;
  `className="p-0"` on a content area that paints to its own edge
  (e.g. a map).
- `PanelToolbar` — sticky top bar (`bg-background p-2`). Holds `PanelClose`,
  `PanelExpand`, and optional `PanelAction` for ghost-variant actions.
  Preview-only — route detail pages don't get a toolbar.
- `PanelGroup` — header row with horizontal padding (`@lg/panel:px-6 px-4`).
  Wraps `PanelHeader` and `PanelAction`.
- `PanelHeader` — wrap for title/breadcrumb + tags. Drops its own `px` when
  nested in a `PanelGroup`.
- `PanelTitle` — `h3`, the title for **preview** headers.
- `PanelBreadcrumb` — framework-agnostic breadcrumb. Use the smart wrapper
  `RouteBreadcrumb` (`apps/app/src/components/layout/route-breadcrumb.tsx`)
  on **route detail** headers — it derives the root crumb from the
  pathname and renders Next `<Link>`s.
- `PanelTags` — inline row for badges next to the title.
- `PanelAction` — right-aligned action region in the header row. Wraps
  `MoreActions` and `PanelNav`.
- `PanelContent` — body region with horizontal padding (`@lg/panel:px-6 px-4`)
  and `flex flex-col gap-4`. **Always** wrap detail body in this — it owns
  the padding that pairs with `PanelGroup`.
- `PanelClose` / `PanelExpand` — icon buttons; the latter takes a Next
  `<Link>` via the `render` prop.
- `PanelNav` — prev/next icon buttons via the `render` prop. Hidden below
  `@lg/panel`.
- `MoreActions` — data-driven action menu. Pass `items: ActionItem[]`;
  items with `pinned: true` render inline when the row has room and fall
  back into the dropdown when it doesn't. Pass `hidePinned` in the preview
  toolbar where you want everything to live in the dropdown.

---

### 3. List page (no preview pane)

For list-only screens, use the Panel primitives for the header and content
just like a detail page. This keeps page-title padding, sticky-toolbar
coordination, and breakpoint behavior consistent with detail views.

```tsx
// app/(app)/<entity>/page.tsx
export default function EntityPage() {
  return (
    <PanelProvider>
      <Panel className="max-w-none">
        <PanelGroup>
          <PanelHeader>
            <PanelTitle>Entity</PanelTitle>
          </PanelHeader>
        </PanelGroup>
        <PanelContent>
          <EntityTable />
        </PanelContent>
      </Panel>
    </PanelProvider>
  );
}
```

> **Migration note.** Shipments / orders / products / issues / inventory /
> explorer currently use `<H3>` + table directly inside `<Panel>`. That
> shape is the older pattern and should be migrated to the Panel-primitive
> shape above as each module is touched.

---

### 4. List page **with** side preview

This is the listings shape. The page renders **two** sibling `PanelProvider`s.
The second one is collapsible (`open`) and resizable, with a single `Suspense`
wrapping the `EntityPreviewView` wrapper (which owns the suspense read).

```tsx
// app/(app)/<entity>/page.tsx — client component
export default function EntityListPage() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // On mobile, route to the detail page instead of opening a preview.
  const handleSelect = (id: string) =>
    isMobile ? router.push(`/<entity>/${id}`) : setSelectedId(id);
  const handleClose = () => setSelectedId(null);

  return (
    <>
      <PanelProvider>
        <Panel className="max-w-none">
          {/* list */}
        </Panel>
      </PanelProvider>

      <PanelProvider
        id={selectedId}
        onClose={handleClose}
        open={selectedId !== null}
        resizable
      >
        <Panel>
          {selectedId && (
            <ErrorBoundary fallback={<ErrorView message="Failed to load <entity>" />}>
              <Suspense fallback={<EntityPreviewViewSkeleton />}>
                <EntityPreviewView id={selectedId} onClose={handleClose} />
              </Suspense>
            </ErrorBoundary>
          )}
        </Panel>
      </PanelProvider>
    </>
  );
}
```

One `Suspense`, not two. `EntityPreviewView` reads `getOne` once and threads
`entity` to both the preview header and the panel content as props — see §6.
The `PanelProvider` snapshot mechanism keeps the previous selection's chrome
visible during the close animation (see `snapshotRef` in `panel.tsx`), so
the `selectedId &&` guard is safe.

`isMobile` routes to the standalone detail page instead of opening a preview
that would consume the whole viewport.

**Selection state is `useState`, not URL.** The preview is intentionally
ephemeral — `setSelectedId(id)` lives in React state and isn't reflected in
`?selected=` or any other URL param. A refresh clears the preview; that's
desired. Don't add URL plumbing unless deep-linkable previews become a
product requirement.

---

### 5. Route detail page

Server component. Prefetch what the body and the header both need, hydrate,
wrap in one `Panel` with a single `Suspense` around the `EntityDetailView`
wrapper:

```tsx
// app/(app)/<entity>/[id]/page.tsx
export default async function EntityDetailPage({ params }: {...}) {
  const { id } = await params;
  await prefetch(trpc.entity.getOne.queryOptions({ id }));
  await prefetch(trpc.entity.getNeighbors.queryOptions({ id }));

  return (
    <HydrateClient>
      <PanelProvider>
        <Panel>
          <ErrorBoundary fallback={<ErrorView message="Failed to load <entity>" />}>
            <Suspense fallback={<EntityDetailViewSkeleton />}>
              <EntityDetailView id={id} />
            </Suspense>
          </ErrorBoundary>
        </Panel>
      </PanelProvider>
    </HydrateClient>
  );
}
```

Mandatory:

- Always `prefetch` every query that a child `useSuspenseQuery` will consume.
  See `MEMORY.md` → "HydrateClient is one-shot dehydrate".
- Always pair `prefetch` with `HydrateClient`.
- Always include `getNeighbors` so `PanelNav` has prev/next IDs.
- One `ErrorBoundary` + one `Suspense` wrapping the `EntityDetailView`
  wrapper. The wrapper reads `getOne` and `getNeighbors` once and threads
  `entity` / `neighbors` to the presentational header and content as props.
  Slow body queries (e.g. `EbayListingForm`'s own reads) suspend inside the
  body component, preserving the "chrome paints, body shows form-level
  loading" UX without needing a second outer Suspense.

---

### 6. Component split inside the module

A module that supports both surfaces exports **two** wrappers (data-owning)
plus **three** presentational components from
`modules/<entity>/views/<entity>/<entity>-panel.tsx`:

| Component | Used by | Owns | Description |
|---|---|---|---|
| `EntityDetailView` | route detail page | `useSuspenseQuery(getOne)` + `useSuspenseQuery(getNeighbors)` | Wrapper that handles not-found and renders header + content |
| `EntityPreviewView` | side preview pane | `useSuspenseQuery(getOne)` | Wrapper that handles not-found (closes panel) and renders preview header + content |
| `EntityPageHeader` | inside `EntityDetailView` | — (props: `entity`, `neighbors`) | `PanelGroup` + `RouteBreadcrumb` + tags + `PanelAction` (`MoreActions` + `PanelNav`) |
| `EntityPreviewHeader` | inside `EntityPreviewView` | — (props: `entity`, `onClose`) | `PanelToolbar` (close + expand + ghost `MoreActions`) **and** `PanelGroup` + `PanelTitle` + tags |
| `EntityPanelContent` | inside both wrappers | — (props: `entity`) | `PanelContent` wrapping the shared body |

Only the two wrappers need to be exported — the presentational components
stay file-local. Keep all five in one file so the data flow is obvious.

A matching `<entity>-panel-skeleton.tsx` exports:

- `EntityDetailViewSkeleton` = composed `EntityPageHeaderSkeleton` + `EntityPanelContentSkeleton`
- `EntityPreviewViewSkeleton` = composed `EntityPreviewHeaderSkeleton` + `EntityPanelContentSkeleton`
- Plus the three building-block skeletons themselves (still useful when the
  body composes differently from the default).

Every skeleton is built from the same `Panel*` primitives as the real
component so the layout doesn't reflow when data resolves.

#### `EntityDetailView` (route-detail wrapper)

```tsx
export function EntityDetailView({ id }: { id: string }) {
  const trpc = useTRPC();
  const { data: entity } = useSuspenseQuery(trpc.entity.getOne.queryOptions({ id }));
  const { data: neighbors } = useSuspenseQuery(trpc.entity.getNeighbors.queryOptions({ id }));

  if (!entity) {
    return <EntityPanelEmpty message="Not found" action={<Link href="/<entity>">Back</Link>} />;
  }

  return (
    <>
      <EntityPageHeader entity={entity} neighbors={neighbors} />
      <EntityPanelContent entity={entity} />
    </>
  );
}
```

#### `EntityPreviewView` (side-preview wrapper)

```tsx
export function EntityPreviewView({ id, onClose }: { id: string; onClose: () => void }) {
  const trpc = useTRPC();
  const { data: entity } = useSuspenseQuery(trpc.entity.getOne.queryOptions({ id }));

  if (!entity) {
    // Preview not-found closes the panel rather than navigating away —
    // the list is already on screen behind the preview.
    return <EntityPanelEmpty message="Not found" action={<button onClick={onClose} type="button">Close</button>} />;
  }

  return (
    <>
      <EntityPreviewHeader entity={entity} onClose={onClose} />
      <EntityPanelContent entity={entity} />
    </>
  );
}
```

#### `EntityPageHeader` (presentational — props only, no hooks)

```tsx
function EntityPageHeader({ entity, neighbors }: { entity: EntityData; neighbors: EntityNeighbors }) {
  return (
    <PanelGroup>
      <PanelHeader>
        <RouteBreadcrumb currentLabel={entity.title} />
        <EntityStatusTags entity={entity} />
      </PanelHeader>
      <PanelAction>
        <MoreActions items={getEntityActions(entity)} />
        <PanelNav
          prev={neighbors.prevId ? <Link href={`/<entity>/${neighbors.prevId}`} /> : undefined}
          next={neighbors.nextId ? <Link href={`/<entity>/${neighbors.nextId}`} /> : undefined}
        />
      </PanelAction>
    </PanelGroup>
  );
}
```

#### `EntityPreviewHeader` (presentational — props only, no hooks)

```tsx
function EntityPreviewHeader({ entity, onClose }: { entity: EntityData; onClose: () => void }) {
  return (
    <>
      <PanelToolbar>
        <PanelClose onClose={onClose} />
        <PanelExpand render={<Link href={`/<entity>/${entity.id}`} />} />
        <PanelAction>
          <MoreActions hidePinned items={getEntityActions(entity)} variant="ghost" />
        </PanelAction>
      </PanelToolbar>
      <PanelGroup>
        <PanelHeader>
          <PanelTitle>{entity.title}</PanelTitle>
          <EntityStatusTags entity={entity} />
        </PanelHeader>
      </PanelGroup>
    </>
  );
}
```

Fragment because `PanelToolbar` and `PanelGroup` are both top-level children
of the same `Panel` (the toolbar is sticky, the header isn't). Extract
`EntityStatusTags` (or whatever tag composition the entity uses) so the two
headers don't drift on the badge block.

#### `EntityPanelContent` (presentational — props only, no hooks except body-specific reads)

```tsx
function EntityPanelContent({ entity }: { entity: EntityData }) {
  return (
    <PanelContent>
      {/* shared body — sections, forms, etc. */}
    </PanelContent>
  );
}
```

Wrap the body in `PanelContent`. That's what pairs with `PanelGroup`'s
horizontal padding; without it the body has zero `px` and visually drifts
from the header. The body may still do its own `useQuery` calls (e.g. for
secondary data like `recentSold`) — those don't suspend at the outer
boundary because they shouldn't gate first paint.

---

### 7. Actions (`MoreActions`)

Pass actions as a data array so they compose:

```tsx
function getEntityActions(entity: EntityData): ActionItem[] {
  return [
    {
      icon: <ExternalLinkIcon />,
      label: "View on …",
      pinned: true,                        // tries to render inline if room
      render: <DynamicLink href={entity.url} openInNewWindow />,
    },
    {
      icon: <CopyIcon />,
      label: "Duplicate",
      onSelect: () => { … },               // dropdown-only
    },
  ];
}
```

- Inline candidates are marked `pinned: true`. The component measures
  available width via `ResizeObserver` and pins what fits — the rest fall
  back into the dropdown.
- In the **preview toolbar**, pass `hidePinned` so nothing inlines (the
  toolbar is too narrow for it to be useful) and `variant="ghost"` to match
  the close/expand icons.

---

### 8. Skeletons

`Suspense` boundary fallbacks must mirror the structure of the real
component using the same primitives. Otherwise the layout reflows when
data resolves. Pattern:

- `EntityDetailViewSkeleton` → fragment of `EntityPageHeaderSkeleton` + `EntityPanelContentSkeleton`.
- `EntityPreviewViewSkeleton` → fragment of `EntityPreviewHeaderSkeleton` + `EntityPanelContentSkeleton`.
- `EntityPageHeaderSkeleton` → `PanelGroup` + `PanelHeader` + skeleton bars
  + `PanelAction` with three icon-sized squares (matches `MoreActions`
  + `PanelNav` row).
- `EntityPreviewHeaderSkeleton` → `PanelToolbar` + `PanelGroup` shape
  identical to the real preview header.
- `EntityPanelContentSkeleton` → `PanelContent` with the same grid the
  real body uses. Use container-query breakpoints
  (`@3xl:grid-cols-7 grid-cols-1 gap-6` inside a `@container` wrapper) so
  the layout responds to the panel's actual width, not the viewport — the
  same body renders in both the narrow preview pane and the wide route
  detail page.

---

### 9. Quick checklist before shipping a new module

- [ ] List page is either `<H3>` + table inside `<Panel className="max-w-none pb-0">`, or it adopts the listings two-`PanelProvider` shape for side preview.
- [ ] Route detail page: server component, `prefetch` for every consumed `useSuspenseQuery`, `HydrateClient`, single `ErrorBoundary`, **one** `Suspense` around `EntityDetailView`.
- [ ] Side preview (if applicable): second `PanelProvider` with `id` / `open` / `onClose` / `resizable`, mobile routes to the detail page, **one** `Suspense` around `EntityPreviewView`.
- [ ] Module exports two wrappers (`EntityDetailView`, `EntityPreviewView`) plus a matching skeleton file. Presentational components stay file-local.
- [ ] `EntityDetailView` and `EntityPreviewView` each read `getOne` once and pass `entity` to header + content as props — no `useSuspenseQuery` calls below them.
- [ ] `EntityPageHeader` uses `PanelGroup` + `RouteBreadcrumb` + `PanelAction` (`MoreActions` + `PanelNav`).
- [ ] `EntityPreviewHeader` uses `PanelToolbar` (close + expand + ghost `MoreActions`) **and** `PanelGroup` + `PanelTitle`.
- [ ] `EntityPanelContent` is wrapped in `PanelContent`.
- [ ] Actions are returned from a single `getEntityActions(entity): ActionItem[]` helper, reused by both headers.
- [ ] Tag composition (status badges, etc.) is extracted into a single `EntityTags` / `EntityStatusTags` component used by both headers.
- [ ] Body grid breakpoints use container queries (`@3xl:`, etc. inside an `@container` wrapper), not viewport queries (`lg:`).
- [ ] Add the entity to `ROOT_SEGMENTS` in `route-breadcrumb.tsx` so the breadcrumb root resolves.

---

## Open follow-ups

The listings module is fully migrated to the patterns above. The one
remaining item is a future-work marker, not drift:

1. **`getListingActions` has `Duplicate` and `End listing` commented out
   pending mutation handlers.** Restore them when the mutations exist.
