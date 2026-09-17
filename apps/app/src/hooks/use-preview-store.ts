import { create } from "zustand";
import type { PreviewKind } from "@/components/preview/preview-registry";

// A new preview kind is one entry in components/preview/preview-registry.tsx.
// Nothing here changes: `kind` is the registry's key set.
export interface Preview {
  id: string;
  kind: PreviewKind;
}

interface PreviewStore {
  close: () => void;
  open: (preview: Preview) => void;
  preview: Preview | null;
}

export const usePreviewStore = create<PreviewStore>((set) => ({
  preview: null,
  open: (preview) => set({ preview }),
  close: () => set({ preview: null }),
}));
