"use client";
import {
  Panel,
  PanelContent,
  PanelGroup,
  PanelHeader,
  PanelProvider,
  PanelTitle,
} from "@sparkyidea/ui/components/panel";
import dynamic from "next/dynamic";
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
    <PanelProvider>
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
    </PanelProvider>
  );
}
