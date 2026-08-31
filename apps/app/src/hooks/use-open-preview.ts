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
    issue: (id: string) => {
      if (isMobile) {
        router.push(`/issues/${id}`);
        return;
      }
      open({ kind: "issue", id });
    },
    listing: (id: string) => {
      if (isMobile) {
        router.push(`/listings/${id}`);
        return;
      }
      open({ kind: "listing", id });
    },
    listingVariant: (id: string, listingId: string) => {
      if (isMobile) {
        router.push(`/listings/${listingId}/variants/${id}`);
        return;
      }
      open({ kind: "listing-variant", id, listingId });
    },
    product: (id: string) => {
      if (isMobile) {
        router.push(`/products/${id}`);
        return;
      }
      open({ kind: "product", id });
    },
    productVariant: (id: string, productId: string) => {
      if (isMobile) {
        router.push(`/products/${productId}/variants/${id}`);
        return;
      }
      open({ kind: "product-variant", id, productId });
    },
    order: (id: string) => {
      if (isMobile) {
        router.push(`/orders/${id}`);
        return;
      }
      open({ kind: "order", id });
    },
    scanListing: (id: string) => {
      if (isMobile) {
        router.push(`/explorer/listings/${id}`);
        return;
      }
      open({ kind: "scan-listing", id });
    },
    shipment: (id: string) => {
      if (isMobile) {
        router.push(`/shipments/${id}`);
        return;
      }
      open({ kind: "shipment", id });
    },
  };
}
