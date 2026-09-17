"use client";

import {
  Panel,
  PanelClose,
  PanelContent,
  PanelProvider,
  PanelToolbar,
} from "@sparkyidea/ui/components/panel";
import { useSidebar } from "@sparkyidea/ui/components/sidebar";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorView } from "@/components/error-view";
import { type Preview, usePreviewStore } from "@/hooks/use-preview-store";
import { PREVIEW_REGISTRY } from "./preview-registry";

// Mounted once in the shared AppShell. Owns the right-side preview Panel and
// dispatches to the right view based on the open preview kind. Pages and
// tables don't render their own preview panel — they call useOpenPreview()
// to set the store and let this host render.
export function PreviewPanel() {
  const preview = usePreviewStore((s) => s.preview);
  const close = usePreviewStore((s) => s.close);
  const pathname = usePathname();
  const { setOpen: setSidebarOpen } = useSidebar();
  const isPreviewOpen = preview !== null;

  // Clear whenever the route changes — expand button, sidebar nav,
  // breadcrumb, etc. The store outlives navigations; the preview shouldn't.
  useEffect(() => {
    close();
  }, [pathname, close]);

  // Auto-collapse the sidebar only on the rising edge — when the preview
  // transitions from closed → open. The ref guard is load-bearing:
  // useSidebar's setOpen reference changes whenever the sidebar state
  // changes, so without it, a user manually expanding the sidebar while a
  // preview is open would re-trigger the effect and snap it shut again.
  // Switching previews (X → Y) keeps isPreviewOpen=true and doesn't fire.
  const wasPreviewOpenRef = useRef(false);
  useEffect(() => {
    if (isPreviewOpen && !wasPreviewOpenRef.current) {
      setSidebarOpen(false);
    }
    wasPreviewOpenRef.current = isPreviewOpen;
  }, [isPreviewOpen, setSidebarOpen]);

  return (
    <PanelProvider
      id={preview?.id ?? null}
      onClose={close}
      open={preview !== null}
      resizable
    >
      <Panel>
        {preview && (
          <ErrorBoundary FallbackComponent={PreviewErrorFallback}>
            <Suspense fallback={<PreviewSkeleton kind={preview.kind} />}>
              <PreviewContent onClose={close} preview={preview} />
            </Suspense>
          </ErrorBoundary>
        )}
      </Panel>
    </PanelProvider>
  );
}

function PreviewContent({
  preview,
  onClose,
}: {
  preview: Preview;
  onClose: () => void;
}) {
  const { View } = PREVIEW_REGISTRY[preview.kind];
  return <View id={preview.id} onClose={onClose} />;
}

function PreviewSkeleton({ kind }: { kind: Preview["kind"] }) {
  const { Skeleton } = PREVIEW_REGISTRY[kind];
  return <Skeleton />;
}

// Route detail pages convert NOT_FOUND into a real 404 via prefetch +
// next/navigation. Previews can't navigate, so any throw — NOT_FOUND or
// otherwise — renders here. The toolbar's close button is the recovery
// affordance for every failure mode, so we render it unconditionally
// alongside the generic ErrorView.
function PreviewErrorFallback() {
  const close = usePreviewStore((s) => s.close);
  return (
    <>
      <PanelToolbar>
        <PanelClose onClose={close} />
      </PanelToolbar>
      <PanelContent>
        <ErrorView message="Failed to load preview" />
      </PanelContent>
    </>
  );
}
