"use client";

import { TableSkeleton } from "@sparkyidea/dataview/skeletons";
import { channelsTableProperties } from "./channels-table-properties";

export function ChannelsTableSkeleton() {
  return (
    <TableSkeleton
      pagination="loadMore"
      properties={channelsTableProperties}
      rowCount={10}
    />
  );
}
