import { create } from "zustand";

export interface SaveBarEntry {
  discardDisabled?: boolean;
  id: string;
  message?: string;
  onDiscard: () => void;
  onSave: () => void | Promise<void>;
  saveDisabled?: boolean;
  saving?: boolean;
}

interface ContextualSaveBarState {
  active: SaveBarEntry | null;
  attentionTick: number;
  register: (entry: SaveBarEntry) => void;
  requestAttention: () => void;
  stack: SaveBarEntry[];
  unregister: (id: string) => void;
}

export const useContextualSaveBar = create<ContextualSaveBarState>((set) => ({
  stack: [],
  active: null,
  attentionTick: 0,
  register: (entry) =>
    set((state) => {
      const next = state.stack.filter((e) => e.id !== entry.id);
      next.push(entry);
      return { stack: next, active: next.at(-1) ?? null };
    }),
  unregister: (id) =>
    set((state) => {
      const next = state.stack.filter((e) => e.id !== id);
      return { stack: next, active: next.at(-1) ?? null };
    }),
  requestAttention: () =>
    set((state) => ({ attentionTick: state.attentionTick + 1 })),
}));
