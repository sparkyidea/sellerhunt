"use client";

import {
  GallerySkeleton,
  ToolbarSkeleton,
} from "@sparkyidea/dataview/skeletons";
import { scanListingsGalleryProperties } from "./scan-listings-gallery-properties";

export function ScanListingsGallerySkeleton() {
  return (
    <>
      <ToolbarSkeleton enableSettings tabCount={1} />
      <GallerySkeleton
        cardCount={25}
        cardSize="small"
        properties={scanListingsGalleryProperties}
      />
    </>
  );
}
