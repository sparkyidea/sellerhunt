import type { ReactNode } from "react";
import type { Preview } from "@/hooks/use-preview-store";

export type PanelContent =
  | { type: "route"; href: string; children: ReactNode; error?: boolean }
  | { type: "preview"; href: string; preview: Preview };

export interface PanelSurface {
  content: PanelContent;
  id: number;
}

export interface PanelWorkspaceState {
  main: PanelSurface | null;
  phase: "idle" | "opening" | "closing" | "expanding";
  preview: PanelSurface | null;
  queued: PanelContent | null;
  revision: number;
}

export const initialPanelWorkspace: PanelWorkspaceState = {
  main: null,
  preview: null,
  queued: null,
  phase: "idle",
  revision: 0,
};

export type PanelWorkspaceEvent =
  | { type: "navigate"; content: PanelContent }
  | { type: "open"; content: PanelContent }
  | { type: "close" }
  | { type: "expand" }
  | { type: "finish"; revision: number };

// Surface identity is independent of route identity. Promotion moves the
// preview record into main without changing its React key or its content.
export function panelWorkspaceReducer(
  state: PanelWorkspaceState,
  event: PanelWorkspaceEvent
): PanelWorkspaceState {
  switch (event.type) {
    case "navigate":
      return navigate(state, event.content);
    case "open": {
      if (state.phase === "expanding") {
        return state;
      }
      const revision = state.revision + 1;
      return {
        ...state,
        revision,
        preview: { id: state.preview?.id ?? revision, content: event.content },
        phase: state.preview ? "idle" : "opening",
      };
    }
    case "close":
      if (!state.preview || state.phase === "expanding") {
        return state;
      }
      return { ...state, phase: "closing", revision: state.revision + 1 };
    case "expand":
      if (!state.preview || state.phase === "expanding") {
        return state;
      }
      return {
        ...state,
        phase: "expanding",
        revision: state.revision + 1,
      };
    case "finish":
      return finish(state, event.revision);
    default:
      return state;
  }
}

function navigate(
  state: PanelWorkspaceState,
  content: PanelContent
): PanelWorkspaceState {
  if (state.phase === "expanding") {
    return {
      ...state,
      queued:
        content.href === state.preview?.content.href &&
        !(content.type === "route" && content.error)
          ? null
          : content,
    };
  }
  if (state.main?.content.href === content.href) {
    // The server route can arrive before OR after the expansion ends.
    // Keep the already mounted preview, including its local state.
    if (
      state.main.content.type === "preview" &&
      !(content.type === "route" && content.error)
    ) {
      return state;
    }
    if (
      state.main.content.type === "route" &&
      content.type === "route" &&
      Boolean(state.main.content.error) === Boolean(content.error)
    ) {
      return { ...state, main: { ...state.main, content } };
    }
  }
  const revision = state.revision + 1;
  return {
    ...state,
    revision,
    main: { id: state.main?.id ?? revision, content },
    phase: state.preview ? "closing" : "idle",
  };
}

function finish(
  state: PanelWorkspaceState,
  revision: number
): PanelWorkspaceState {
  if (revision !== state.revision || state.phase === "idle") {
    return state;
  }
  if (state.phase === "expanding") {
    const promoted: PanelWorkspaceState = {
      ...state,
      main: state.preview,
      preview: null,
      queued: null,
      phase: "idle",
    };
    return state.queued
      ? panelWorkspaceReducer(promoted, {
          type: "navigate",
          content: state.queued,
        })
      : promoted;
  }
  return {
    ...state,
    preview: state.phase === "closing" ? null : state.preview,
    phase: "idle",
  };
}
