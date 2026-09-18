"use client";

import {
  type ComponentProps,
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { useIsMobile } from "../hooks/use-mobile";
import {
  initialPanelState,
  type PanelEntry,
  type PanelSource,
  type PanelState,
  panelReducer,
} from "../lib/panel-state";
import {
  DEFAULT_PREVIEW_WIDTH,
  PanelCanvas,
  PanelFrame,
  PanelLayer,
} from "./panel";

export type { PanelEntry } from "../lib/panel-state";

const MainContentContext = createContext<
  ((content: PanelSource) => void) | null
>(null);
const PanelContext = createContext<{
  mode: "main" | "preview";
  expand?: () => void;
  close?: () => void;
}>({ mode: "main" });

export function usePanel() {
  return useContext(PanelContext);
}

/** Declare main content inside PanelRoot, retaining concrete children. */
export function PanelMain({ id, children, replace }: PanelEntry) {
  const publish = useContext(MainContentContext);
  useLayoutEffect(() => {
    publish?.({ type: "main", id, children, replace });
  }, [children, id, replace, publish]);
  return publish ? null : children;
}

function frameState(phase: PanelState["phase"], preview: boolean) {
  if (phase === "expanding") {
    return preview ? "expanding" : "closed";
  }
  return preview && phase === "closing" ? "closed" : "open";
}

/** Own the panel lifecycle independently of routing. IDs need not be URLs. */
export function PanelRoot({
  children,
  preview = null,
  onPreviewOpenChange,
  defaultPreviewWidth = DEFAULT_PREVIEW_WIDTH,
  ...props
}: Omit<
  ComponentProps<typeof PanelCanvas>,
  | "children"
  | "previewState"
  | "previewWidth"
  | "resizing"
  | "onMotionComplete"
  | "ref"
> & {
  children: ReactNode;
  preview?: PanelEntry | null;
  /** Reports surface presence, including after closing or promotion completes. */
  onPreviewOpenChange?: (open: boolean) => void;
  defaultPreviewWidth?: number;
}) {
  const [state, dispatch] = useReducer(panelReducer, initialPanelState);
  const [width, setWidth] = useState(defaultPreviewWidth);
  const [resizing, setResizing] = useState(false);
  const isMobile = useIsMobile();
  const canvasRef = useRef<HTMLDivElement>(null);
  const focusAfterTransition = useRef(false);
  const publish = useCallback((content: PanelSource) => {
    dispatch({ type: "navigate", content });
  }, []);
  const expand = useCallback(() => {
    focusAfterTransition.current = true;
    dispatch({ type: "expand" });
  }, []);
  const close = useCallback(() => dispatch({ type: "close" }), []);

  const requestedId = useRef<string | null>(null);
  useLayoutEffect(() => {
    const next = preview && !isMobile ? preview : null;
    const changed = requestedId.current !== (next?.id ?? null);
    requestedId.current = next?.id ?? null;
    if (next) {
      dispatch({
        type: changed ? "open" : "update-preview",
        content: { ...next, type: "preview" },
      });
    } else if (changed) {
      dispatch({ type: "close" });
    }
  }, [isMobile, preview]);

  const previewOpen = state.preview !== null;
  const wasPreviewOpen = useRef(false);
  useEffect(() => {
    if (previewOpen !== wasPreviewOpen.current) {
      wasPreviewOpen.current = previewOpen;
      onPreviewOpenChange?.(previewOpen);
    }
  }, [onPreviewOpenChange, previewOpen]);

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
    <MainContentContext.Provider value={publish}>
      {children}
      <PanelCanvas
        {...props}
        onMotionComplete={finishMotion}
        previewState={state.preview ? frameState(state.phase, true) : "none"}
        previewWidth={width}
        ref={canvasRef}
        resizing={resizing}
      >
        {surfaces.map((surface) => {
          const isPreview = surface === state.preview;
          const surfaceState = frameState(state.phase, isPreview);
          return (
            <PanelFrame
              aria-label={isPreview ? "Preview panel" : "Main panel"}
              className={isPreview && isMobile ? "hidden" : undefined}
              inert={surfaceState === "closed" || undefined}
              key={surface.id}
              onClose={close}
              onResizeChange={setResizing}
              onWidthChange={setWidth}
              state={surfaceState}
              tabIndex={-1}
              variant={isPreview ? "preview" : "main"}
              width={width}
            >
              <PanelLayer
                key={`${surface.content.type}:${surface.content.id}:${Boolean(surface.content.replace)}`}
              >
                <PanelContext.Provider
                  value={{
                    mode:
                      isPreview && state.phase !== "expanding"
                        ? "preview"
                        : "main",
                    expand,
                    close,
                  }}
                >
                  {surface.content.children}
                </PanelContext.Provider>
              </PanelLayer>
            </PanelFrame>
          );
        })}
      </PanelCanvas>
    </MainContentContext.Provider>
  );
}
