import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ActiveChannelState {
  activeChannelId: string | null;
  setActiveChannel: (id: string | null) => void;
}

export const useActiveChannel = create<ActiveChannelState>()(
  persist(
    (set) => ({
      activeChannelId: null,
      setActiveChannel: (id) => set({ activeChannelId: id }),
    }),
    { name: "active-channel" }
  )
);
