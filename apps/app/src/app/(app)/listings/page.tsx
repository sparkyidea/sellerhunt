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
import { ListingsGallerySkeleton } from "@/modules/listings/data/listings-gallery/listings-gallery-skeleton";

const ListingsGallery = dynamic(
  () =>
    import("@/modules/listings/data/listings-gallery").then(
      (mod) => mod.ListingsGallery
    ),
  {
    ssr: false,
    loading: () => <ListingsGallerySkeleton />,
  }
);

export default function ListingsPage() {
  return (
    <PanelProvider>
      <Panel className="max-w-none">
        <PanelGroup>
          <PanelHeader>
            <PanelTitle>Listings</PanelTitle>
          </PanelHeader>
        </PanelGroup>
        <PanelContent>
          <ListingsGallery />
        </PanelContent>
      </Panel>
    </PanelProvider>
  );
}
