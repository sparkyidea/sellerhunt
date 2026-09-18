"use client";

import {
  DEFAULT_PANEL_WIDTH,
  PanelLayer,
  PanelLayout,
  PanelProvider,
} from "@sparkyidea/ui/components/panel";
import { useSidebar } from "@sparkyidea/ui/components/sidebar";
import { useIsMobile } from "@sparkyidea/ui/hooks/use-mobile";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { usePreviewStore } from "@/hooks/use-preview-store";
import { PanelRouteContext } from "./panel-route";
import { PanelViewContext } from "./panel-view-context";
import {
  initialPanelWorkspace,
  type PanelContent,
  type PanelWorkspaceState,
  panelWorkspaceReducer,
} from "./panel-workspace-state";
import { PreviewPanel } from "./preview-panel";
import { PREVIEW_REGISTRY } from "./preview-registry";

function contentKey(content: PanelContent) {
  return `${content.type}:${content.href}:${content.type === "route" && Boolean(content.error)}`;
}

function panelFrameState(
  phase: PanelWorkspaceState["phase"],
  isPreview: boolean
) {
  if (phase === "expanding") {
    return isPreview ? "expanding" : "closed";
  }
  return isPreview && phase === "closing" ? "closed" : "open";
}

export function PanelWorkspace({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(
    panelWorkspaceReducer,
    initialPanelWorkspace
  );
  const [width, setWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [resizing, setResizing] = useState(false);
  const requestedPreview = usePreviewStore((s) => s.preview);
  const close = usePreviewStore((s) => s.close);
  const { setOpen: setSidebarOpen } = useSidebar();
  const isMobile = useIsMobile();
  const canvasRef = useRef<HTMLDivElement>(null);
  const focusAfterTransition = useRef(false);

  const publish = useCallback((content: PanelContent) => {
    dispatch({ type: "navigate", content });
  }, []);
  const expand = useCallback(() => {
    focusAfterTransition.current = true;
    dispatch({ type: "expand" });
  }, []);

  // Subscribe to commands rather than keeping two copies of the lifecycle.
  // Closing removes the command immediately, but the reducer retains content
  // until its closing transition finishes.
  useLayoutEffect(() => {
    if (requestedPreview) {
      dispatch({
        type: "open",
        content: {
          type: "preview",
          href: PREVIEW_REGISTRY[requestedPreview.kind].page(
            requestedPreview.id
          ),
          preview: requestedPreview,
        },
      });
    } else {
      dispatch({ type: "close" });
    }
  }, [requestedPreview]);

  const previewOpen = state.preview !== null;
  const wasPreviewOpen = useRef(false);
  useEffect(() => {
    if (previewOpen && !wasPreviewOpen.current) {
      setSidebarOpen(false);
    }
    wasPreviewOpen.current = previewOpen;
  }, [previewOpen, setSidebarOpen]);

  useEffect(() => {
    if (!previewOpen) {
      close();
    }
  }, [close, previewOpen]);

  useEffect(() => {
    if (isMobile) {
      close();
    }
  }, [close, isMobile]);

  const finishMotion = useCallback(() => {
    dispatch({ type: "finish", revision: state.revision });
  }, [state.revision]);

  useEffect(() => {
    if (state.phase === "idle" && focusAfterTransition.current) {
      focusAfterTransition.current = false;
      canvasRef.current
        ?.querySelector<HTMLElement>('[data-variant="main"]')
        ?.focus({ preventScroll: true });
    }
  }, [state.phase]);

  const surfaces = [state.main, state.preview].filter(
    (surface) => surface !== null
  );

  return (
    <PanelRouteContext.Provider value={publish}>
      {/* These are route declarations, sheets and app-level dialogs. */}
      {children}
      <PanelLayout
        onMotionComplete={finishMotion}
        previewState={
          state.preview ? panelFrameState(state.phase, true) : "none"
        }
        previewWidth={width}
        ref={canvasRef}
        resizing={resizing}
      >
        {surfaces.map((surface) => {
          const isPreview = surface === state.preview;
          const frameState = panelFrameState(state.phase, isPreview);
          return (
            <PanelProvider
              aria-label={isPreview ? "Preview panel" : "Main panel"}
              className={isPreview && isMobile ? "hidden" : undefined}
              inert={frameState === "closed" || undefined}
              key={surface.id}
              onClose={close}
              onResizeChange={setResizing}
              onWidthChange={setWidth}
              state={frameState}
              tabIndex={-1}
              variant={isPreview ? "preview" : "main"}
              width={width}
            >
              <PanelLayer
                inert={(!isPreview && state.phase === "expanding") || undefined}
                key={contentKey(surface.content)}
              >
                <PanelViewContext.Provider
                  value={{
                    mode:
                      isPreview && state.phase !== "expanding"
                        ? "preview"
                        : "main",
                    expand,
                  }}
                >
                  {surface.content.type === "route" ? (
                    surface.content.children
                  ) : (
                    <PreviewPanel
                      onClose={close}
                      preview={surface.content.preview}
                    />
                  )}
                </PanelViewContext.Provider>
              </PanelLayer>
            </PanelProvider>
          );
        })}
      </PanelLayout>
    </PanelRouteContext.Provider>
  );
}
