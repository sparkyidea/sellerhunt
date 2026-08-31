"use client";

import { useInfiniteController } from "@sparkyidea/dataview/hooks";
import { DataViewProvider } from "@sparkyidea/dataview/providers";
import type { Limit, WhereNode } from "@sparkyidea/dataview/types";
import { TableView } from "@sparkyidea/dataview/views/table-view";
import { useTRPC } from "@/lib/utils/trpc/client";
import { channelsTableProperties } from "./channels-table-properties";

interface ChannelsTableProps {
  filter?: WhereNode[] | null;
  limit?: Limit;
  search?: string;
  sort?: { property: string; direction: "asc" | "desc" }[];
}

export function ChannelsTable({
  filter = null,
  limit = 25,
  search = "",
  sort = [],
}: ChannelsTableProps) {
  const trpc = useTRPC();

  const { controller } = useInfiniteController({
    dataQuery: (params) =>
      trpc.channel.getMany.infiniteQueryOptions(params, {
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
      properties={channelsTableProperties}
    >
      <TableView pagination="loadMore" showVerticalLines={false} />
    </DataViewProvider>
  );
}
