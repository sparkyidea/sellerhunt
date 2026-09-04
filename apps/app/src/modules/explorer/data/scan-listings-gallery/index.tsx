"use client";

import { useInfiniteController } from "@sparkyidea/dataview/hooks";
import { PresetTabs } from "@sparkyidea/dataview/preset-tabs";
import { DataViewProvider } from "@sparkyidea/dataview/providers";
import {
  NotionToolbarActions,
  NotionToolbarChips,
} from "@sparkyidea/dataview/toolbars/notion";
import type {
  GroupConfigInput,
  Limit,
  WhereNode,
} from "@sparkyidea/dataview/types";
import { getScalarRollups } from "@sparkyidea/dataview/types";
import { GalleryView } from "@sparkyidea/dataview/views/gallery-view";
import { useOpenPreview } from "@/hooks/use-open-preview";
import { useTRPC } from "@/lib/utils/trpc/client";

import { marketplacePresets } from "../marketplaces-presets";
import { scanListingsPresets } from "../scan-listings-presets";
import { scanListingsGalleryProperties } from "./scan-listings-gallery-properties";

const scanRollups = getScalarRollups(scanListingsGalleryProperties);

interface ScanListingsGalleryProps {
  filter?: WhereNode[] | null;
  group?: GroupConfigInput | null;
  limit?: Limit;
  search?: string;
  sort?: { property: string; direction: "asc" | "desc" }[];
}

export function ScanListingsGallery({
  filter = null,
  group = null,
  limit = 25,
  search = "",
  sort = [{ property: "itemSold", direction: "desc" }],
}: ScanListingsGalleryProps) {
  const trpc = useTRPC();
  const openPreview = useOpenPreview();

  const { controller } = useInfiniteController({
    groupQuery: (params) =>
      trpc.scanListing.getGroup.infiniteQueryOptions(
        { ...params, rollups: scanRollups },
        {
          getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
        }
      ),

    dataQuery: (params) =>
      trpc.scanListing.getMany.infiniteQueryOptions(
        { ...params, rollups: scanRollups },
        {
          getNextPageParam: (lastPage) =>
            lastPage.hasNextPage ? lastPage.endCursor : undefined,
        }
      ),
  });

  const groupConfigForView = group ? { ...group, showCount: true } : undefined;

  return (
    <DataViewProvider
      controller={controller}
      defaults={{
        filter,
        group: groupConfigForView,
        limit,
        search,
        sort: sort ?? [],
      }}
      properties={scanListingsGalleryProperties}
    >
      <PresetTabs
        aria-label="Marketplace"
        mobileSelect={false}
        options={marketplacePresets}
        variant="line"
      />
      <PresetTabs
        options={scanListingsPresets}
        trailing={<NotionToolbarActions enableSettings />}
      />
      <NotionToolbarChips />
      <GalleryView
        cardPreview="imageUrls"
        cardSize="small"
        fitMedia
        onCardClick={(item: { id: string }) => openPreview.scanListing(item.id)}
        pagination="infiniteScroll"
        stickyHeader={{ enabled: true, offset: 0 }}
      />
    </DataViewProvider>
  );
}
