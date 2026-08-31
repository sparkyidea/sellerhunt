"use client";

import { usePageController } from "@sparkyidea/dataview/hooks";
import { DataViewProvider } from "@sparkyidea/dataview/providers";
import { NotionToolbar } from "@sparkyidea/dataview/toolbars/notion";
import type { Limit, WhereNode } from "@sparkyidea/dataview/types";
import { getScalarRollups } from "@sparkyidea/dataview/types";
import { TableView } from "@sparkyidea/dataview/views/table-view";
import { DataViewTab } from "@/components/dataview-tab";
import { useActiveChannel } from "@/hooks/use-active-channel";
import { useOpenPreview } from "@/hooks/use-open-preview";
import { useTRPC } from "@/lib/utils/trpc/client";
import type { Order } from "../../types";
import { ordersPresets } from "../orders-presets";
import { ordersTableBulkActions } from "./orders-table-bulk-actions";
import { ordersTableProperties } from "./orders-table-properties";

const orderRollups = getScalarRollups(ordersTableProperties);

interface OrdersTableProps {
  filter?: WhereNode[] | null;
  limit?: Limit;
  search?: string;
  sort?: { property: string; direction: "asc" | "desc" }[];
}

export function OrdersTable({
  filter = null,
  limit = 25,
  search = "",
  sort = [{ property: "orderedAt", direction: "desc" }],
}: OrdersTableProps) {
  const trpc = useTRPC();
  const openPreview = useOpenPreview();
  const { activeChannelId } = useActiveChannel();

  const { controller } = usePageController({
    groupQuery: (params) =>
      trpc.order.getGroup.infiniteQueryOptions(
        { ...params, channelId: activeChannelId, rollups: orderRollups },
        {
          getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
        }
      ),

    dataQuery: (params) =>
      trpc.order.getMany.queryOptions({
        ...params,
        channelId: activeChannelId,
        rollups: orderRollups,
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
      key={activeChannelId}
      properties={ordersTableProperties}
    >
      <NotionToolbar enableSettings>
        <DataViewTab options={ordersPresets} />
      </NotionToolbar>
      <TableView
        bulkActions={ordersTableBulkActions}
        onRowClick={(row: Order) => openPreview.order(row.id)}
        pagination="page"
        showVerticalLines={false}
        stickyHeader={{ enabled: true, offset: 0 }}
      />
    </DataViewProvider>
  );
}
