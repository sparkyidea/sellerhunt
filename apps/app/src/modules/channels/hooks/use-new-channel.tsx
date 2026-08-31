import { create } from "zustand";

interface NewChannelState {
  isOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
}

export const useNewChannel = create<NewChannelState>((set) => ({
  isOpen: false,
  onOpen: () => set({ isOpen: true }),
  onClose: () => set({ isOpen: false }),
}));
