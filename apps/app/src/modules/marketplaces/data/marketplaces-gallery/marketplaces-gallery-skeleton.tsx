"use client";

import { GallerySkeleton } from "@sparkyidea/dataview/skeletons";
import { marketplacesGalleryProperties } from "./marketplaces-gallery-properties";

export function MarketplacesGallerySkeleton() {
  return (
    <GallerySkeleton
      cardCount={8}
      cardSize="medium"
      properties={marketplacesGalleryProperties}
    />
  );
}
