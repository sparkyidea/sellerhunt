import type { ReactNode } from "react";

/** An opaque identity shared by main and preview content for promotion. */
export interface PanelEntry {
  children: ReactNode;
  id: string;
  /** Replace promoted content even when the identity matches (e.g. errors). */
  replace?: boolean;
}

export type PanelSource = PanelEntry & { type: "main" | "preview" };

export interface PanelSurface {
  content: PanelSource;
  id: number;
}

export interface PanelState {
  main: PanelSurface | null;
  phase: "idle" | "opening" | "closing" | "expanding";
  preview: PanelSurface | null;
  queued: PanelSource | null;
  revision: number;
}

export const initialPanelState: PanelState = {
  main: null,
  preview: null,
  queued: null,
  phase: "idle",
  revision: 0,
};

export type PanelEvent =
  | { type: "navigate"; content: PanelSource }
  | { type: "open"; content: PanelSource }
  | { type: "update-preview"; content: PanelSource }
  | { type: "close" }
  | { type: "expand" }
  | { type: "finish"; revision: number };

// Surface identity is independent of route identity. Promotion moves the
// preview record into main without changing its React key or its content.
export function panelReducer(state: PanelState, event: PanelEvent): PanelState {
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
    case "update-preview":
      if (!state.preview || state.preview.content.id !== event.content.id) {
        return state;
      }
      return {
        ...state,
        preview: { ...state.preview, content: event.content },
      };
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

function navigate(state: PanelState, content: PanelSource): PanelState {
  if (state.phase === "expanding") {
    return {
      ...state,
      queued:
        content.id === state.preview?.content.id &&
        !(content.type === "main" && content.replace)
          ? null
          : content,
    };
  }
  if (state.main?.content.id === content.id) {
    // Main content can arrive before OR after expansion ends.
    // Keep the already mounted preview, including its local state.
    if (
      state.main.content.type === "preview" &&
      !(content.type === "main" && content.replace)
    ) {
      return state;
    }
    if (
      state.main.content.type === "main" &&
      content.type === "main" &&
      Boolean(state.main.content.replace) === Boolean(content.replace)
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

function finish(state: PanelState, revision: number): PanelState {
  if (revision !== state.revision || state.phase === "idle") {
    return state;
  }
  if (state.phase === "expanding") {
    const promoted: PanelState = {
      ...state,
      main: state.preview,
      preview: null,
      queued: null,
      phase: "idle",
    };
    return state.queued
      ? panelReducer(promoted, {
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
