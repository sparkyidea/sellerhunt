"use client";

import { PanelRoot } from "@sparkyidea/ui/components/panel-root";
import { useSidebar } from "@sparkyidea/ui/components/sidebar";
import { useIsMobile } from "@sparkyidea/ui/hooks/use-mobile";
import { type ReactNode, useCallback, useEffect, useMemo } from "react";
import { PreviewContent } from "@/components/preview/preview-content";
import { PREVIEW_REGISTRY } from "@/components/preview/preview-registry";
import { usePreviewStore } from "@/hooks/use-preview-store";

/** App adapter: registry/store commands and sidebar policy, not panel lifetimes. */
export function AppPanels({ children }: { children: ReactNode }) {
  const requestedPreview = usePreviewStore((s) => s.preview);
  const close = usePreviewStore((s) => s.close);
  const { setOpen } = useSidebar();
  const isMobile = useIsMobile();
  const preview = useMemo(
    () =>
      requestedPreview
        ? {
            id: PREVIEW_REGISTRY[requestedPreview.kind].page(
              requestedPreview.id
            ),
            children: (
              <PreviewContent onClose={close} preview={requestedPreview} />
            ),
          }
        : null,
    [close, requestedPreview]
  );
  const onPreviewOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        setOpen(false);
      } else {
        close();
      }
    },
    [close, setOpen]
  );
  useEffect(() => {
    if (isMobile) {
      close();
    }
  }, [close, isMobile]);
  return (
    <PanelRoot onPreviewOpenChange={onPreviewOpenChange} preview={preview}>
      {children}
    </PanelRoot>
  );
}
