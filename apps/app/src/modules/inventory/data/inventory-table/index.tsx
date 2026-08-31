"use client";

import { usePageController } from "@sparkyidea/dataview/hooks";
import { DataViewProvider } from "@sparkyidea/dataview/providers";
import { NotionToolbar } from "@sparkyidea/dataview/toolbars/notion";
import type { Limit, WhereNode } from "@sparkyidea/dataview/types";
import { getScalarRollups } from "@sparkyidea/dataview/types";
import { TableView } from "@sparkyidea/dataview/views/table-view";
import { DataViewTab } from "@/components/dataview-tab";
import { useOpenPreview } from "@/hooks/use-open-preview";
import { useTRPC } from "@/lib/utils/trpc/client";
import { inventoryPresets } from "../../inventory-presets";
import type { InventoryRow } from "../../types";
import { inventoryTableBulkActions } from "./inventory-table-bulk-actions";
import { inventoryTableProperties } from "./inventory-table-properties";

const inventoryRollups = getScalarRollups(inventoryTableProperties);

interface InventoryTableProps {
  filter?: WhereNode[] | null;
  limit?: Limit;
  search?: string;
  sort?: { property: string; direction: "asc" | "desc" }[];
}

export function InventoryTable({
  filter = null,
  limit = 25,
  search = "",
  sort = [],
}: InventoryTableProps) {
  const trpc = useTRPC();
  const openPreview = useOpenPreview();

  const { controller } = usePageController({
    groupQuery: (params) =>
      trpc.productVariant.getGroup.infiniteQueryOptions(
        { ...params, rollups: inventoryRollups },
        {
          getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
        }
      ),

    dataQuery: (params) =>
      trpc.productVariant.getMany.queryOptions({
        ...params,
        rollups: inventoryRollups,
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
      properties={inventoryTableProperties}
    >
      <NotionToolbar enableSettings>
        <DataViewTab options={inventoryPresets} />
      </NotionToolbar>
      <TableView
        bulkActions={inventoryTableBulkActions}
        onRowClick={(row: InventoryRow) =>
          openPreview.productVariant(row.id, row.productId)
        }
        pagination="page"
        showVerticalLines={false}
        stickyHeader={{ enabled: true, offset: 0 }}
      />
    </DataViewProvider>
  );
}
