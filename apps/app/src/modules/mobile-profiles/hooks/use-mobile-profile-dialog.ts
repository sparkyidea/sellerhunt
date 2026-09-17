import { create } from "zustand";

/**
 * Single launcher for the bulk upload dialog. The dialog mounts once app-wide
 * (see `WidgetProvider`), so any call site opens it without owning open state.
 *
 * There is no single-profile create path any more: captures arrive per box, in
 * batches, and every entry carries only its app and credentials. Nothing
 * edits a profile's credentials afterwards — delete it and upload again.
 */
interface MobileProfileDialogStore {
  isOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
}

export const useMobileProfileDialog = create<MobileProfileDialogStore>(
  (set) => ({
    isOpen: false,
    onOpen: () => set({ isOpen: true }),
    onClose: () => set({ isOpen: false }),
  })
);
