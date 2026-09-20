"use client";

import { hasAdminRole } from "@dashseller/auth/lib/auth/roles";
import { NotFound } from "@sparkyidea/ui/components/not-found";
import { PanelRoot } from "@sparkyidea/ui/components/panel-root";
import { useSidebar } from "@sparkyidea/ui/components/sidebar";
import { useIsMobile } from "@sparkyidea/ui/hooks/use-mobile";
import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useMemo } from "react";
import { PreviewContent } from "@/components/preview/preview-content";
import { PREVIEW_REGISTRY } from "@/components/preview/preview-registry";
import { useNavigationArea } from "@/hooks/use-navigation-area";
import { usePreviewStore } from "@/hooks/use-preview-store";
import { authClient } from "@/lib/auth-client";
import { getNavigationArea } from "@/lib/navigation-area";

/** App adapter: registry/store commands and sidebar policy, not panel lifetimes. */
export function AppPanels({ children }: { children: ReactNode }) {
  const requestedPreview = usePreviewStore((s) => s.preview);
  const close = usePreviewStore((s) => s.close);
  const area = useNavigationArea();
  const { data: session, isPending } = authClient.useSession();
  const accessLost =
    area === "admin" &&
    !isPending &&
    (!session || session.user.banned || !hasAdminRole(session.user.role));
  const previewPath = requestedPreview
    ? PREVIEW_REGISTRY[requestedPreview.kind].page(requestedPreview.id)
    : null;
  const previewInArea =
    previewPath !== null && getNavigationArea(previewPath) === area;
  const { setOpen } = useSidebar();
  const isMobile = useIsMobile();
  const preview = useMemo(
    () =>
      requestedPreview && previewInArea && !accessLost
        ? {
            id: PREVIEW_REGISTRY[requestedPreview.kind].page(
              requestedPreview.id
            ),
            children: (
              <PreviewContent onClose={close} preview={requestedPreview} />
            ),
          }
        : null,
    [accessLost, close, previewInArea, requestedPreview]
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
    if (isMobile || !previewInArea || accessLost) {
      close();
    }
  }, [accessLost, close, isMobile, previewInArea]);
  // The server layout still gates routes; this also discards retained admin
  // surfaces if the client session loses admin access in place.
  if (accessLost) {
    return <NotFound homeLink={<Link href="/" />} />;
  }
  return (
    <PanelRoot onPreviewOpenChange={onPreviewOpenChange} preview={preview}>
      {children}
    </PanelRoot>
  );
}
