import { create } from "zustand";

// Add new preview kinds here as new previews are implemented. Each variant
// carries the minimum data needed for both the route fallback (mobile) and
// the in-place preview render (desktop) — see use-open-preview.ts and
// preview-host.tsx.
export type Preview =
  | { kind: "issue"; id: string }
  | { kind: "listing"; id: string }
  | { kind: "listing-variant"; id: string; listingId: string }
  | { kind: "product"; id: string }
  | { kind: "product-variant"; id: string; productId: string }
  | { kind: "order"; id: string }
  | { kind: "scan-listing"; id: string }
  | { kind: "shipment"; id: string };

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
