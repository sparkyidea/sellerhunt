"use client";

import {
  GallerySkeleton,
  ToolbarSkeleton,
} from "@sparkyidea/dataview/skeletons";
import { listingsGalleryProperties } from "./listings-gallery-properties";

export function ListingsGallerySkeleton() {
  return (
    <>
      <ToolbarSkeleton enableSettings tabCount={4} />
      <GallerySkeleton
        cardCount={25}
        cardSize="small"
        properties={listingsGalleryProperties}
      />
    </>
  );
}
