"use client";

import { useIsMobile } from "@sparkyidea/ui/hooks/use-mobile";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  PREVIEW_REGISTRY,
  type PreviewKind,
} from "@/components/preview/preview-registry";
import { usePreviewStore } from "./use-preview-store";

// Single entry point for opening a preview anywhere in the app: the side panel
// on desktop, the kind's own page on mobile. Both come from PREVIEW_REGISTRY, so
// a new kind needs no change here.
export function useOpenPreview() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const open = usePreviewStore((s) => s.open);

  return (kind: PreviewKind, id: string) => {
    if (isMobile) {
      router.push(PREVIEW_REGISTRY[kind].page(id) as Route);
      return;
    }
    open({ kind, id });
  };
}
