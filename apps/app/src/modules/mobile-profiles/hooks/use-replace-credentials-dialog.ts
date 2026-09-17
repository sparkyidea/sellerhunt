import { create } from "zustand";

/**
 * Launcher for the replace-credentials dialog — the one credential act that is
 * still about a single profile. Creating profiles is bulk now and belongs to
 * [useMobileProfileDialog].
 */
interface ReplaceCredentialsDialogStore {
  isOpen: boolean;
  onClose: () => void;
  onOpen: (profileId: number) => void;
  /** The profile whose stored credentials are replaced; null only while closed. */
  profileId: number | null;
}

export const useReplaceCredentialsDialog =
  create<ReplaceCredentialsDialogStore>((set) => ({
    isOpen: false,
    profileId: null,
    onOpen: (profileId) => set({ isOpen: true, profileId }),
    onClose: () => set({ isOpen: false, profileId: null }),
  }));
