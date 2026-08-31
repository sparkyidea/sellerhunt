import { create } from "zustand";

interface ContextSearchState {
  isOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
}

export const useContextSearch = create<ContextSearchState>((set) => ({
  isOpen: false,
  onOpen: () => set({ isOpen: true }),
  onClose: () => set({ isOpen: false }),
}));
