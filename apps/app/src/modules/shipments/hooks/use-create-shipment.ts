import { create } from "zustand";

interface CreateShipmentState {
  isOpen: boolean;
  onClose: () => void;
  onOpen: (orderId: string) => void;
  orderId: string | null;
}

export const useCreateShipment = create<CreateShipmentState>((set) => ({
  isOpen: false,
  orderId: null,
  onOpen: (orderId: string) => set({ isOpen: true, orderId }),
  onClose: () => set({ isOpen: false, orderId: null }),
}));
