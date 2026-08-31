"use client";

import { useIsMobile } from "@sparkyidea/ui/hooks/use-mobile";
import { useRouter } from "next/navigation";
import { usePreviewStore } from "./use-preview-store";

// Single entry point for opening a preview anywhere in the app. Each kind
// maps to its route fallback (used on mobile) and the in-place open
// (used on desktop). Adding a new kind requires:
//   1. extending `Preview` in use-preview-store.ts
//   2. adding a method here
//   3. adding a case to PreviewPanel in components/preview/preview-panel.tsx
export function useOpenPreview() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const open = usePreviewStore((s) => s.open);

  return {
    scanListing: (id: string) => {
      if (isMobile) {
        router.push(`/explorer/listings/${id}`);
        return;
      }
      open({ kind: "scan-listing", id });
    },
  };
}
