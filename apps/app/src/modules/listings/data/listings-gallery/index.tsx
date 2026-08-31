"use client";

import { useInfiniteController } from "@sparkyidea/dataview/hooks";
import { DataViewProvider } from "@sparkyidea/dataview/providers";
import { NotionToolbar } from "@sparkyidea/dataview/toolbars/notion";
import type {
  GroupConfigInput,
  Limit,
  WhereNode,
} from "@sparkyidea/dataview/types";
import { getScalarRollups } from "@sparkyidea/dataview/types";
import { GalleryView } from "@sparkyidea/dataview/views/gallery-view";
import { useCallback } from "react";
import { DataViewTab } from "@/components/dataview-tab";
import { useActiveChannel } from "@/hooks/use-active-channel";
import { useOpenPreview } from "@/hooks/use-open-preview";
import { useTRPC } from "@/lib/utils/trpc/client";
import { listingsPresets } from "../listings-presets";
import { listingsGalleryProperties } from "./listings-gallery-properties";

const listingRollups = getScalarRollups(listingsGalleryProperties);

interface ListingsGalleryProps {
  filter?: WhereNode[] | null;
  group?: GroupConfigInput | null;
  limit?: Limit;
  search?: string;
  sort?: { property: string; direction: "asc" | "desc" }[];
}

export function ListingsGallery({
  filter = null,
  group = null,
  limit = 25,
  search = "",
  sort = [{ property: "startedAt", direction: "desc" }],
}: ListingsGalleryProps) {
  const trpc = useTRPC();
  const { activeChannelId } = useActiveChannel();
  const openPreview = useOpenPreview();

  const handleCardClick = useCallback(
    (item: { id: string }) => openPreview.listing(item.id),
    [openPreview]
  );

  const { controller } = useInfiniteController({
    groupQuery: (params) =>
      trpc.listing.getGroup.infiniteQueryOptions(
        { ...params, channelId: activeChannelId, rollups: listingRollups },
        {
          getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
        }
      ),

    dataQuery: (params) =>
      trpc.listing.getMany.infiniteQueryOptions(
        { ...params, channelId: activeChannelId, rollups: listingRollups },
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
      key={activeChannelId}
      properties={listingsGalleryProperties}
    >
      <NotionToolbar enableSettings>
        <DataViewTab options={listingsPresets} />
      </NotionToolbar>
      <GalleryView
        cardPreview="imageUrls"
        cardSize="small"
        fitMedia
        onCardClick={handleCardClick}
        pagination="loadMore"
        stickyHeader={{ enabled: true, offset: 0 }}
      />
    </DataViewProvider>
  );
}
