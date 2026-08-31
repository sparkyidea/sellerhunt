import { create } from "zustand";

// Add new preview kinds here as new previews are implemented. Each variant
// carries the minimum data needed for both the route fallback (mobile) and
// the in-place preview render (desktop) — see use-open-preview.ts and
// preview-host.tsx.
export interface Preview {
  id: string;
  kind: "scan-listing";
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
