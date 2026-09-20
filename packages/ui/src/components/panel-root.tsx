"use client";

import {
  type ComponentProps,
  createContext,
  Fragment,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useIsMobile } from "../hooks/use-mobile";
import {
  initialPanelState,
  type PanelEntry,
  type PanelState,
  panelReducer,
} from "../lib/panel-state";
import {
  DEFAULT_PREVIEW_RATIO,
  PanelCanvas,
  PanelFrame,
  PanelLayer,
} from "./panel";

export type { PanelEntry } from "../lib/panel-state";

interface MainContentValue {
  promoted: boolean;
  replace: (id: string) => void;
}
const MainContentContext = createContext<MainContentValue | null>(null);
const PanelContext = createContext<{
  mode: "main" | "preview";
  expand?: (navigate?: () => void) => void;
  close?: () => void;
}>({ mode: "main" });

export function usePanel() {
  return useContext(PanelContext);
}

/** Render route content on the server; suppress a promoted route's duplicate body. */
export function PanelMain({ id, children, replace }: PanelEntry) {
  const main = useContext(MainContentContext);
  const promoted = main?.promoted ?? false;
  const replaceMain = main?.replace;
  useLayoutEffect(() => {
    if (replace && promoted) {
      replaceMain?.(id);
    }
  }, [id, promoted, replace, replaceMain]);
  // Keep the route boundary alive for server errors, without mounting its body.
  return promoted ? null : <Fragment key={id}>{children}</Fragment>;
}

function seed(mainId: string): PanelState {
  return panelReducer(initialPanelState, {
    type: "navigate",
    content: { type: "main", id: mainId, children: null },
  });
}

interface ExpansionNavigation {
  navigate: () => void;
  origin: string;
  target: string;
}

function frameState(phase: PanelState["phase"], preview: boolean) {
  if (phase === "expanding") {
    return preview ? "expanding" : "closed";
  }
  return preview && phase === "closing" ? "closed" : "open";
}

/**
 * Render live route content on the server; retain only a promoted preview.
 * Route bodies use PanelMain so matching arrivals cannot mount duplicates.
 * IDs are opaque. Router navigation is supplied through expand's callback.
 */
export function PanelRoot({
  children,
  mainId,
  preview = null,
  onPreviewOpenChange,
  defaultPreviewRatio = DEFAULT_PREVIEW_RATIO,
  ...props
}: Omit<
  ComponentProps<typeof PanelCanvas>,
  | "children"
  | "previewState"
  | "previewRatio"
  | "resizing"
  | "onMotionComplete"
  | "ref"
> & {
  children: ReactNode;
  /** Identity of the live route. Content itself flows through children. */
  mainId: string;
  preview?: PanelEntry | null;
  /** Reports surface presence, including after closing or promotion completes. */
  onPreviewOpenChange?: (open: boolean) => void;
  /** Share of the canvas after subtracting the gap; capped at an equal split. */
  defaultPreviewRatio?: number;
}) {
  const [state, dispatch] = useReducer(panelReducer, mainId, seed);
  const [resizing, setResizing] = useState(false);
  const isMobile = useIsMobile();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(() =>
    Math.max(0, Math.min(defaultPreviewRatio, 0.5))
  );
  const focusAfterTransition = useRef(false);
  const pendingNavigation = useRef<ExpansionNavigation | null>(null);
  const [knownMainId, setKnownMainId] = useState(mainId);
  // Reconcile before rendering descendants, never commit a new route inside an
  // old/closing surface. Unlike reducer-only consumers, a live router cannot
  // retain its old children after it commits a different route.
  if (knownMainId !== mainId) {
    setKnownMainId(mainId);
    dispatch({ type: "route", id: mainId });
  }
  const replace = useCallback((id: string) => {
    pendingNavigation.current = null;
    dispatch({
      type: "navigate",
      content: { type: "main", id, children: null, replace: true },
    });
  }, []);
  const expand = useCallback(
    (navigate?: () => void) => {
      if (state.phase === "expanding" || pendingNavigation.current) {
        return;
      }
      if (!state.preview) {
        navigate?.();
        return;
      }
      focusAfterTransition.current = true;
      pendingNavigation.current = navigate
        ? { origin: mainId, target: state.preview.content.id, navigate }
        : null;
      dispatch({ type: "expand" });
    },
    [mainId, state.phase, state.preview]
  );
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

  // A new link/Back intent must win even if its route takes longer to load
  // than this animation. Do not let our deferred navigation overwrite it.
  useEffect(() => {
    if (state.phase !== "expanding") {
      return;
    }
    const cancel = () => {
      pendingNavigation.current = null;
      focusAfterTransition.current = false;
      dispatch({ type: "route", id: mainId });
    };
    const onClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const link =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>("a[href]")
          : null;
      if (
        link &&
        !link.hasAttribute("download") &&
        (!link.target || link.target === "_self")
      ) {
        cancel();
      }
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", cancel);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", cancel);
    };
  }, [mainId, state.phase]);

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
  const promoted = state.main?.content.type === "preview";
  const promotedId = promoted ? state.main?.content.id : null;
  useEffect(() => {
    if (state.phase !== "idle") {
      return;
    }
    const pending = pendingNavigation.current;
    pendingNavigation.current = null;
    if (focusAfterTransition.current) {
      focusAfterTransition.current = false;
      canvasRef.current
        ?.querySelector<HTMLElement>('[data-variant="main"]')
        ?.focus({ preventScroll: true });
    }
    if (pending?.origin === mainId && pending.target === promotedId) {
      pending.navigate();
    }
  }, [mainId, promotedId, state.phase]);
  const main = useMemo(() => ({ promoted, replace }), [promoted, replace]);

  const surfaces = [state.main, state.preview].filter(
    (surface) => surface !== null
  );
  return (
    <MainContentContext.Provider value={main}>
      <PanelCanvas
        {...props}
        onMotionComplete={finishMotion}
        previewRatio={ratio}
        previewState={state.preview ? frameState(state.phase, true) : "none"}
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
              onRatioChange={setRatio}
              onResizeChange={setResizing}
              ratio={ratio}
              state={surfaceState}
              tabIndex={-1}
              variant={isPreview ? "preview" : "main"}
            >
              <PanelLayer
                key={
                  surface.content.type === "preview"
                    ? `preview:${surface.content.id}`
                    : "main"
                }
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
                  {surface.content.type === "preview"
                    ? surface.content.children
                    : null}
                  {!isPreview && (!promoted || mainId === promotedId)
                    ? children
                    : null}
                </PanelContext.Provider>
              </PanelLayer>
            </PanelFrame>
          );
        })}
      </PanelCanvas>
    </MainContentContext.Provider>
  );
}
