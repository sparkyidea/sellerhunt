import { create } from "zustand";
import { getSettingsReturnLocation } from "@/lib/navigation-area";

interface SettingsOriginStore {
  /** Call from the settings link before it navigates (`Link onNavigate`). */
  capture: () => void;
  /** Page settings was opened from, filters included. Null after a reload. */
  returnTo: string | null;
}

// In memory only, like Shopify: survives settings tab changes, not a reload
// or a new tab. Never read from the URL, so it is never user input.
export const useSettingsOrigin = create<SettingsOriginStore>((set) => ({
  returnTo: null,
  capture: () => set({ returnTo: getSettingsReturnLocation(window.location) }),
}));
