---
title: Panel Structure and Lifetimes
impact: HIGH
tags: [patterns, layout, panel, detail-page, preview-pane]
---

## Panel structure

The shared `(app)/layout.tsx` mounts one `AppPanels` adapter around the reusable
UI `PanelRoot` for Explorer, admin and settings. The nested `admin/layout.tsx`
retains the server role gate and admin dialogs, without a second shell.
Routes declare content with `PanelRoute`; they do not own panel surfaces.
`useNavigationArea()` derives the dashboard from the pathname; settings is part
of the app area and admin has no settings entry. The page settings was opened
from is captured in the `useSettingsOrigin` store when the settings link is
clicked (`Link onNavigate`); the settings layout returns there on close, or to
`/explorer/listings` after a reload or in a fresh tab. `AppPanels` keeps a stable root;
route navigation replaces the main content, including on settings.
The outgoing page unmounts. Leaving the shared shell clears the preview store.
Previews from another area are cleared,
and loss of admin access discards retained admin surfaces.

### Static shell and search params

The `(app)` layout prerenders as static HTML. Search params do not exist at
build time, so a component that calls `useSearchParams()` during a static
render bails out to the client up to the nearest `Suspense`, and a bare
boundary at the layout leaves an empty shell in the HTML. Never read search
params in shell-wide components (layout, header, sidebar). State that must
survive a route change, such as the settings origin, lives in a client store in
memory (`hooks/use-settings-origin.ts`), never in `?from=`. Verify with
`next build`: app routes stay `○` and
`.next/server/app/explorer/listings.html` contains the header and “Explore Listings”
inside the main surface. Route bodies render on the server; client-only data
views still use their own Suspense/loading boundaries.

### Ownership

- **UI primitives:** `packages/ui/src/components/panel.tsx` owns geometry,
  resizing, scrolling, headers and actions.
- **Reusable root:** `packages/ui/src/components/panel-root.tsx` and
  `packages/ui/src/lib/panel-state.ts` own surface identity, retention,
  promotion, focus and interrupted animations. `mainId` identifies the live
  route rendered through `children`; only preview elements are captured in
  memory. IDs are opaque strings, not necessarily URLs. No app/router imports.
- **App adapter:** `apps/app/src/components/panels/app-panels.tsx`
  connects the preview store/registry and sidebar policy and supplies `mainId`
  from the pathname. `PanelRoute` marks the route body and errors with
  `PanelMain`. `PreviewExpandLink` prefetches and expands before navigating.
- **Entity registry:** `apps/app/src/components/preview/preview-registry.tsx`
  supplies `page`, `View`, and `Skeleton` for each kind. `useOpenPreview` opens
  a side preview on desktop and navigates directly on mobile.

### Naming

| Name | Responsibility |
| --- | --- |
| `PanelRoot` | Owns the main/preview lifecycle and composes their surfaces. |
| `PanelMain` | Renders the route body, suppresses its duplicate after promotion, and signals errors. |
| `usePanel` | Reads the current mode and exposes expand/close commands. |
| `PanelCanvas` | Positions and clips the animated surfaces. |
| `PanelFrame` | Renders one surface, its border, corners and resize handle. |
| `PanelLayer` | Keeps a content layer positioned inside its frame. |
| `Panel` | Scroll container composed from header, toolbar and content primitives. |
| `AppPanels` | App adapter for registry/store commands and sidebar behavior. |
| `PanelRoute` | Next.js adapter that supplies pathname identity to `PanelMain`. |
| `PanelRouteError` | Retryable route error content declared through `PanelRoute`. |
| `PreviewExpandLink` | Next.js link that prefetches, expands, then navigates. |
| `PreviewContent` | Renders registry-selected entity content with loading/error boundaries. |

Keep `PanelHeader`, `PanelTitle`, `PanelContent`, `PanelToolbar`, `PanelGroup`,
`PanelAction`, `PanelTags`, `PanelBreadcrumb` and `PanelNav` for visual composition.
The public type `PanelEntry` is exported from `panel-root` and describes `{ id, children, replace? }`; it is distinct
from the rendered `PanelContent` component. Internal lifecycle types live in
`panel-state.ts` rather than sharing the visual component's name.

### Reuse in another app

Import `PanelRoot`, `PanelMain`, and `usePanel` from
`@sparkyidea/ui/components/panel-root`. No SellerHunt adapter is needed:

```tsx
<PanelRoot
  mainId="items"
  preview={selected ? { id: selected.id, children: <ItemView item={selected} /> } : null}
  onPreviewOpenChange={(open) => { if (!open) setSelected(null); }}
>
  <PanelMain id="items">
    <ItemsView onSelect={setSelected} />
  </PanelMain>
</PanelRoot>
```

Views supply their own `Panel` scroll container and header. `usePanel()`
provides `mode`, `expand(navigate?)` and `close()` without requiring navigation.
The optional callback runs once after promotion. Use the
same main/preview ID to preserve the promoted content when a destination arrives;
use `replace` on `PanelMain` to override it, such as for an error.
The open-change callback reports surface presence: closing and promotion report
`false` after the outgoing surface finishes, so clear the controlled preview then.
Rerendering the same preview ID updates content without restarting its lifecycle.
The UI supports mobile presentation; the app decides mobile routing policy.

### Lifetimes and motion

`PanelRoot` remembers the preview size as a proportion of the canvas after
subtracting the inter-panel gap. The default is one-third (`defaultPreviewRatio`);
dragging or keyboard resizing can reach an equal 50/50 split. The canvas excludes
the sidebar, so the selected proportion follows both window and sidebar changes.
The usual 320px minimum yields to the 50% maximum on narrow canvases.
Tailwind arbitrary properties resolve that proportion and its limits in CSS.
No resize observer or React pixel-width state is needed. Only pointer/keyboard
input reads the canvas to convert movement into a ratio; outgoing surfaces read
their width once to freeze content during exit. Open-panel size changes update
the shared edge immediately.

`usePanelMotion` in the UI package drives a single linear Motion animation.
`PANEL_TRANSITION_SECONDS` sets a fixed 200ms duration for opening, closing and
expansion, matching the original CSS transition with linear easing.
Motion animates dimensionless progress: 0 is closed, 1 is the chosen split, and
2 is full width. CSS resolves these against the current canvas, so window and
sidebar changes need no JavaScript retargeting.
`PanelCanvas.onMotionComplete` settles the controller when Motion finishes.
Reduced motion, direct resizing and hidden documents settle immediately.
Cleanup cancels superseded animations.

Motion writes `--panel-progress` directly each frame, without `@property` or
`CSS.registerProperty()`. CSS derives `--panel-reserved` from that progress,
the preferred ratio and the gap. This shared boundary keeps facing edges 8px apart
throughout entry, exit and expansion. Do not animate their positions independently.

- Opening slides a second keyed surface in from the right. Closing freezes its
  rendered width and slides it out to the right while the main fills the space.
  Content stays mounted and opaque until the slide finishes.
- Expanding keeps the outgoing main **content fully opaque** while the preview
  takes its space: the main keeps its rendered width and translates left out of
  the canvas as the preview grows to full width on the same clock. The
  preview keeps its corner radius until promotion. The canvas clips exiting
  content at its edges. Neither exiting panel squeezes
  or reflows its content; both stay mounted until the transition completes.
- Completion removes the old main and promotes the **same** keyed preview
  surface, scroll container and entity component to main. Never collapse and
  recreate the preview to implement expansion.
- Normal expansion waits for motion completion before committing navigation;
  `PreviewExpandLink` requests prefetch immediately. While waiting for that
  route, the outgoing body is not remounted in the promoted surface.
- The matching route boundary renders but `PanelMain` returns null, so no
  duplicate detail body, queries or effects mount. Error/404 boundaries still
  signal `replace` and take over. No hidden copy of the route body is used.
- Navigation after promotion replaces content **inside that full-width surface**.
  Content changes immediately without a fade; no side-panel close animation.
- A different live route takes over immediately, settling expansion before
  rendering its body. Link clicks and browser Back cancel deferred expansion
  navigation even if the next route is slow. Modified/new-tab clicks do not.
  The generic reducer still supports queued `navigate` events for captured
  content; the live route adapter uses `route` events instead.
- Explicit `variant` controls main/preview geometry. Do not infer role from DOM
  sibling order: an outgoing main may still be present.

### Page declarations

List pages wrap a `Panel` in `PanelRoute`. The shared boundary reads the current
route from Next.js with `usePathname()`; pages do not repeat their URL.
Use `Panel className="max-w-none"` for full-width lists, then `PanelGroup` /
`PanelHeader` / `PanelTitle` and `PanelContent` for the body.

Detail routes keep server-side validation and prefetch. The composition is:

```tsx
<PanelRoute>
  <HydrateClient>
    <Panel>
      <ErrorBoundary fallback={<ErrorView message="Failed to load listing" />}>
        <Suspense fallback={<ScanListingDetailViewSkeleton />}>
          <ScanListingDetailView id={listingId} />
        </Suspense>
      </ErrorBoundary>
    </Panel>
  </HydrateClient>
</PanelRoute>
```

Providers required by a promoted preview must live inside `PreviewContent`
or above `PanelRoot`. Pass IDs/route params explicitly to entity views.
Wrap each route's body in `PanelRoute`, below server validation/prefetch and
above client data views. That boundary can suppress a successful duplicate
without hiding or mounting the data view; server errors still reach it.

Settings renders an empty panel next to its sheet. Opening it unmounts the
originating page and closes its preview. Closing restores the full origin URL;
the page mounts with its restored query and can reuse React Query's cache.
There is no query-sync pause for a table retained across settings, since no
such table remains mounted.
Error/404 content uses
`<PanelRoute error>` so it can replace a promoted
view even when the pathname is unchanged. Outside a root, `PanelRoute`
renders its children normally (including the root 404).

### Entity views and headers

Preview and direct-detail entry points share the entity component and body.
`usePanel()` switches from `preview` to `main` as soon as expansion starts.
This removes the preview toolbar and applies full-page header spacing during
the expansion; surface promotion still waits until the motion finishes.
Change header chrome in place; preserve the content component and its key.

- Preview: `PanelToolbar` with `PanelClose`, `PreviewExpandLink`, and optional
  ghost `MoreActions`; then `PanelGroup` for title/breadcrumb and tags.
- `PreviewExpandLink` composes the generic `PanelExpand` with a Next link. Its
  `onNavigate` starts promotion while preserving normal modifier/new-tab clicks.
- Main: the same header/title tree with root breadcrumb and regular actions.
  `RouteBreadcrumb showRoot={false}` hides the root in a side preview.
- `PanelContent` owns body padding and vertical spacing; use container queries
  inside bodies so the same mounted content adapts as its surface widens.
- Detail-only sections, if added, mount after `mode` becomes `main` and should
  fade in. Existing entity bodies currently show the same sections in both modes.
- Actions must use the current mode: deleting a side preview closes it; deleting
  a promoted main navigates to its list.
- Keep one suspense boundary around the entity view and use matching `Panel*`
  primitives in its skeleton. Promotion of already loaded content must not
  introduce a fresh skeleton.

### Primitive composition

`PanelCanvas` is the positioned canvas; its `previewRatio` prop supplies the
preferred CSS split. `PanelFrame` is an explicitly controlled surface
(`variant`, `state`, `ratio`, `onRatioChange`, `onResizeChange`).
`PanelLayer` retains fully opaque content during expansion; the root makes
the outgoing main content inert. Ordinary route changes also have no opacity animation.
`Panel` is the scroll container, with `max-w-240` inner content by default.
Keep its vertical overflow set to `auto` during motion and resizing so the
scrollbar does not disappear and reappear when the animation settles.

`PanelGroup` supplies the shared header-row padding. Nest `PanelHeader` and
`PanelAction` in it. Use `PanelContent` for matching body padding. `MoreActions`
accepts data-driven `ActionItem[]`; pin common actions and use `hidePinned` in
preview toolbars. `PanelNav` accepts render slots for navigation links.

### Validation

The reducer's regression tests live in
`packages/ui/src/lib/__tests__/panel-state.test.ts`. Mounted React and hydration
regressions live in `packages/ui/src/components/__tests__/panel-root.test.tsx`
(Vitest + happy-dom); run both with `bun --cwd packages/ui test`.
Verify both route-arrival orders, stale completion events, navigation during
expansion, server errors, closing and reopening, and navigation after promotion.
Browser verification must also cover actual opacity/width during expansion,
content continuity, preserved full width after navigation, resizing, mobile,
settings and light/dark themes. State tests alone cannot prove the visual effect.
