"use client";

import {
  Panel,
  PanelClose,
  PanelContent,
  PanelToolbar,
} from "@sparkyidea/ui/components/panel";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorView } from "@/components/error-view";
import { type Preview, usePreviewStore } from "@/hooks/use-preview-store";
import { usePanelView } from "./panel-view-context";
import { PREVIEW_REGISTRY } from "./preview-registry";

/** Body only: the workspace owns the surface, transition and mounted lifetime. */
export function PreviewPanel({
  preview,
  onClose,
}: {
  preview: Preview;
  onClose: () => void;
}) {
  return (
    <Panel>
      <ErrorBoundary FallbackComponent={PreviewErrorFallback}>
        <Suspense fallback={<PreviewSkeleton kind={preview.kind} />}>
          <PreviewContent onClose={onClose} preview={preview} />
        </Suspense>
      </ErrorBoundary>
    </Panel>
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

// The same boundary stays mounted after promotion. Only side previews have
// a close affordance; main views use the shell's navigation to recover.
function PreviewErrorFallback() {
  const close = usePreviewStore((s) => s.close);
  const { mode } = usePanelView();
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
