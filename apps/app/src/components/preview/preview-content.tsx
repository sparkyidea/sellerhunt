"use client";

import {
  Panel,
  PanelClose,
  PanelContent,
  PanelToolbar,
} from "@sparkyidea/ui/components/panel";
import { usePanel } from "@sparkyidea/ui/components/panel-root";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorView } from "@/components/error-view";
import { type Preview, usePreviewStore } from "@/hooks/use-preview-store";
import { PREVIEW_REGISTRY } from "./preview-registry";

/** Entity content only: PanelRoot owns its surface and mounted lifetime. */
export function PreviewContent({
  preview,
  onClose,
}: {
  preview: Preview;
  onClose: () => void;
}) {
  const { View, Skeleton } = PREVIEW_REGISTRY[preview.kind];
  return (
    <Panel>
      <ErrorBoundary FallbackComponent={PreviewErrorFallback}>
        <Suspense fallback={<Skeleton />}>
          <View id={preview.id} onClose={onClose} />
        </Suspense>
      </ErrorBoundary>
    </Panel>
  );
}

// The same boundary stays mounted after promotion. Only side previews have
// a close affordance; main views use the shell's navigation to recover.
function PreviewErrorFallback() {
  const close = usePreviewStore((s) => s.close);
  const { mode } = usePanel();
  return (
    <>
      {mode === "preview" && (
        <PanelToolbar>
          <PanelClose onClose={close} />
        </PanelToolbar>
      )}
      <PanelContent>
        <ErrorView message="Failed to load panel" />
      </PanelContent>
    </>
  );
}
