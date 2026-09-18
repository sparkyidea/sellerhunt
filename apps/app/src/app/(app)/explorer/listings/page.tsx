"use client";
import {
  Panel,
  PanelContent,
  PanelGroup,
  PanelHeader,
  PanelTitle,
} from "@sparkyidea/ui/components/panel";
import dynamic from "next/dynamic";
import { PanelRoute } from "@/components/preview/panel-route";
import { ScanListingsGallerySkeleton } from "@/modules/explorer/data/scan-listings-gallery/scan-listings-gallery-skeleton";

const ScanListingsGallery = dynamic(
  () =>
    import("@/modules/explorer/data/scan-listings-gallery").then(
      (mod) => mod.ScanListingsGallery
    ),
  {
    ssr: false,
    loading: () => <ScanListingsGallerySkeleton />,
  }
);

export default function ExplorerListingsPage() {
  return (
    <PanelRoute>
      <Panel className="max-w-none">
        <PanelGroup>
          <PanelHeader>
            <PanelTitle>Explore Listings</PanelTitle>
          </PanelHeader>
        </PanelGroup>
        <PanelContent>
          <ScanListingsGallery />
        </PanelContent>
      </Panel>
    </PanelRoute>
  );
}
