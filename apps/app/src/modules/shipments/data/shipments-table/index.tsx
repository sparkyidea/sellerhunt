"use client";

import { usePageController } from "@sparkyidea/dataview/hooks";
import { DataViewProvider } from "@sparkyidea/dataview/providers";
import { NotionToolbar } from "@sparkyidea/dataview/toolbars/notion";
import type { Limit, WhereNode } from "@sparkyidea/dataview/types";
import { TableView } from "@sparkyidea/dataview/views/table-view";
import { DataViewTab } from "@/components/dataview-tab";
import { useOpenPreview } from "@/hooks/use-open-preview";
import { useTRPC } from "@/lib/utils/trpc/client";
import type { Shipment } from "../../types";
import { shipmentsPresets } from "../shipments-presets";
import { shipmentsTableBulkActions } from "./shipments-table-bulk-actions";
import { shipmentsTableProperties } from "./shipments-table-properties";

interface ShipmentsTableProps {
  filter?: WhereNode[] | null;
  limit?: Limit;
  search?: string;
  sort?: { property: string; direction: "asc" | "desc" }[];
}

export function ShipmentsTable({
  filter = null,
  limit = 25,
  search = "",
  sort = [{ property: "createdAt", direction: "desc" }],
}: ShipmentsTableProps) {
  const trpc = useTRPC();
  const openPreview = useOpenPreview();

  const { controller } = usePageController({
    groupQuery: (params) =>
      trpc.shipment.getGroup.infiniteQueryOptions(params, {
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      }),

    dataQuery: (params) => trpc.shipment.getMany.queryOptions(params),
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
      properties={shipmentsTableProperties}
    >
      <NotionToolbar enableSettings>
        <DataViewTab options={shipmentsPresets} />
      </NotionToolbar>
      <TableView
        bulkActions={shipmentsTableBulkActions}
        onRowClick={(row: Shipment) => openPreview.shipment(row.id)}
        pagination="page"
        showVerticalLines={false}
      />
    </DataViewProvider>
  );
}
