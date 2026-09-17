import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import { ScanListingPreviewView } from "@/modules/explorer/views/scan-listing/scan-listing-panel";
import { ScanListingPreviewViewSkeleton } from "@/modules/explorer/views/scan-listing/scan-listing-panel-skeleton";

const MobileProfilePreviewView = dynamic(() =>
  import(
    "@/modules/mobile-profiles/views/mobile-profile/mobile-profile-panel"
  ).then((mod) => mod.MobileProfilePreviewView)
);
const MobileProfilePreviewViewSkeleton = dynamic(() =>
  import(
    "@/modules/mobile-profiles/views/mobile-profile/mobile-profile-panel-skeleton"
  ).then((mod) => mod.MobileProfilePreviewViewSkeleton)
);

interface PreviewEntry {
  /** Route this kind falls back to on mobile, where there is no side panel. */
  page: (id: string) => string;
  /** Rendered while `View` suspends. */
  Skeleton: ComponentType;
  /** What the side panel shows on desktop. */
  View: ComponentType<{ id: string; onClose: () => void }>;
}

/**
 * Every preview kind, in one place. A new kind is one entry here and nothing
 * else: `PreviewKind` is the key set, `PreviewPanel` renders `View`/`Skeleton`,
 * and `useOpenPreview` navigates to `page` on mobile. `satisfies` makes a
 * half-filled entry a type error, so no kind can reach the panel without a view.
 */
export const PREVIEW_REGISTRY = {
  "mobile-profile": {
    page: (id: string) => `/admin/mobile-profiles/${id}`,
    View: MobileProfilePreviewView,
    Skeleton: MobileProfilePreviewViewSkeleton,
  },
  "scan-listing": {
    page: (id: string) => `/explorer/listings/${id}`,
    View: ScanListingPreviewView,
    Skeleton: ScanListingPreviewViewSkeleton,
  },
} satisfies Record<string, PreviewEntry>;

export type PreviewKind = keyof typeof PREVIEW_REGISTRY;
