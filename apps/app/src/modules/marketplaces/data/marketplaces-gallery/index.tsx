"use client";

import type { marketplace } from "@dashseller/db/schema";
import { env } from "@dashseller/env/app";
import { useInfiniteController } from "@sparkyidea/dataview/hooks";
import { DataViewProvider } from "@sparkyidea/dataview/providers";
import type { Limit, WhereNode } from "@sparkyidea/dataview/types";
import { GalleryView } from "@sparkyidea/dataview/views/gallery-view";
import { useCallback } from "react";
import { useTRPC } from "@/lib/utils/trpc/client";
import { marketplacesGalleryProperties } from "./marketplaces-gallery-properties";

type Marketplace = typeof marketplace.$inferSelect;

interface MarketplacesGalleryProps {
  filter?: WhereNode[] | null;
  limit?: Limit;
  onSelect?: (item: Marketplace) => void;
  search?: string;
  sort?: { property: string; direction: "asc" | "desc" }[];
}

export function MarketplacesGallery({
  filter = null,
  limit = 25,
  onSelect,
  search = "",
  sort = [],
}: MarketplacesGalleryProps) {
  const trpc = useTRPC();

  const handleCardClick = useCallback(
    (item: Marketplace) => {
      if (onSelect) {
        onSelect(item);
        return;
      }
      window.location.href = `${env.NEXT_PUBLIC_API_URL}/oauth/${item.id}/authorize`;
    },
    [onSelect]
  );

  const { controller } = useInfiniteController({
    dataQuery: (params) =>
      trpc.marketplace.getMany.infiniteQueryOptions(params, {
        getNextPageParam: (lastPage) =>
          lastPage.hasNextPage ? lastPage.endCursor : undefined,
      }),
  });

  return (
    <DataViewProvider
      controller={controller}
      defaults={{
        filter,
        limit,
        search,
        sort,
      }}
      properties={marketplacesGalleryProperties}
    >
      <GalleryView
        cardPreview="logoUrl"
        cardSize="small"
        fitMedia
        onCardClick={handleCardClick}
        pagination="loadMore"
      />
    </DataViewProvider>
  );
}
