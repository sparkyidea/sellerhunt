---
title: Panel Structure and Lifetimes
impact: HIGH
tags: [patterns, layout, panel, detail-page, preview-pane]
---

## Panel structure

Each app/admin layout owns a persistent `PanelWorkspace`. Routes declare
content with `PanelRoute`; they do not own panel surfaces. The workspace is
scoped to its layout, so leaving the authenticated/admin layout disposes its
contents along with that layout's access boundary.

### Ownership

- **UI primitives:** `packages/ui/src/components/panel.tsx`. Framework-neutral
  geometry, resizing, content layers, scrolling, header and action composition.
- **App lifecycle:** `apps/app/src/components/preview/panel-workspace.tsx` and
  its pure reducer in `panel-workspace-state.ts`. Own mounted surface identity,
  outgoing content, preview promotion and interrupted navigation.
- **Route adapter:** `PanelRoute` publishes concrete content to the workspace
  in a layout effect. The Next router outlet remains outside the surfaces;
  never snapshot or freeze Next's internal router contexts.
- **Entity registry:** `preview-registry.tsx` supplies `page`, `View`, and
  `Skeleton` for every preview kind. `useOpenPreview` opens a side preview on
  desktop and navigates directly to that page on mobile.

### Lifetimes and motion

`usePanelMotion` in the UI package drives a single linear Motion animation.
`PANEL_TRANSITION_SECONDS` sets a fixed 200ms duration for opening, closing and
expansion, matching the original CSS transition with linear easing.
The layout measures its width only to determine the expansion destination.
`PanelLayout.onMotionComplete` settles the controller when Motion finishes.
Reduced motion, direct resizing and hidden documents settle immediately.
Resize observation retargets expansion; cleanup cancels superseded animations.

Motion writes `--panel-reserved` directly each frame, without `@property` or
`CSS.registerProperty()`. This shared boundary keeps facing edges 8px apart
throughout entry, exit and expansion. Do not animate their positions independently.

- Opening slides a second keyed surface in from the right. Closing freezes its
  rendered width and slides it out to the right while the main fills the space.
  Content stays mounted and opaque until the slide finishes.
- Expanding keeps the outgoing main **content fully opaque** while the preview
  takes its space: the main keeps its rendered width and translates left out of
  the workspace as the preview grows to full width on the same clock. The
  preview keeps its corner radius until promotion. The workspace clips exiting
  content at its edges. Neither exiting panel squeezes
  or reflows its content; both stay mounted until the transition completes.
- Completion removes the old main and promotes the **same** keyed preview
  surface, scroll container and entity component to main. Never collapse and
  recreate the preview to implement expansion.
- The detail route may arrive before or after expansion. A matching successful
  route does not replace the promoted component. Server error/404 content does.
- Navigation after promotion replaces content **inside that full-width surface**.
  Content changes immediately without a fade; no side-panel close animation.
- A different destination arriving during expansion is queued until promotion
  finishes, then replaces the main content immediately.
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

Providers required by retained content must live **inside** `PanelRoute` or
above `PanelWorkspace`. Pass IDs/route params explicitly to entity views.
Do not put page-owned state above the declaration if it must survive a handover;
keep it inside the published view. Content is mounted by the workspace after
hydration; server routes still validate and prefetch data before publishing it.

Settings renders a sheet without a `PanelRoute` declaration, preserving the
existing main and preview surfaces behind it. Error/404 content uses
`<PanelRoute error>` so it can replace a promoted
view even when the pathname is unchanged. Outside a workspace, `PanelRoute`
renders its children normally (including the root 404).

### Entity views and headers

Preview and direct-detail entry points share the entity component and body.
`usePanelView()` switches from `preview` to `main` as soon as expansion starts.
This removes the preview toolbar and applies full-page header spacing during
the expansion; surface promotion still waits until the motion finishes.
Change header chrome in place; preserve the content component and its key.

- Preview: `PanelToolbar` with `PanelClose`, `PreviewExpand`, and optional
  ghost `MoreActions`; then `PanelGroup` for title/breadcrumb and tags.
- `PreviewExpand` composes the generic `PanelExpand` with a Next link. Its
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

`PanelLayout` is the positioned canvas; its `previewWidth` prop supplies both
the animation destination and the CSS width. `PanelProvider` is an explicitly controlled surface
(`variant`, `state`, `width`, `onWidthChange`, `onResizeChange`).
`PanelLayer` retains fully opaque content during expansion; the workspace makes
the outgoing main content inert. Ordinary route changes also have no opacity animation.
`Panel` is the scroll container, with `max-w-240` inner content by default.
Keep its vertical overflow set to `auto` during motion and resizing so the
scrollbar does not disappear and reappear when the animation settles.

`PanelGroup` supplies the shared header-row padding. Nest `PanelHeader` and
`PanelAction` in it. Use `PanelContent` for matching body padding. `MoreActions`
accepts data-driven `ActionItem[]`; pin common actions and use `hidePinned` in
preview toolbars. `PanelNav` accepts render slots for navigation links.

### Validation

The reducer's regression tests live beside the workspace under `__tests__/`.
Verify both route-arrival orders, stale completion events, navigation during
expansion, server errors, closing and reopening, and navigation after promotion.
Browser verification must also cover actual opacity/width during expansion,
content continuity, preserved full width after navigation, resizing, mobile,
settings and light/dark themes. State tests alone cannot prove the visual effect.
