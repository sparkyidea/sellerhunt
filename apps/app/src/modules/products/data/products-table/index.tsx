"use client";

import { usePageController } from "@sparkyidea/dataview/hooks";
import { DataViewProvider } from "@sparkyidea/dataview/providers";
import { NotionToolbar } from "@sparkyidea/dataview/toolbars/notion";
import type {
  GroupConfigInput,
  Limit,
  WhereNode,
} from "@sparkyidea/dataview/types";
import { getScalarRollups } from "@sparkyidea/dataview/types";
import { TableView } from "@sparkyidea/dataview/views/table-view";
import { DataViewTab } from "@/components/dataview-tab";
import { useOpenPreview } from "@/hooks/use-open-preview";
import { useTRPC } from "@/lib/utils/trpc/client";
import { productsPresets } from "../products-presets";
import { productsTableBulkActions } from "./products-table-bulk-actions";
import { productsTableProperties } from "./products-table-properties";

const productRollups = getScalarRollups(productsTableProperties);

interface ProductsTableProps {
  filter?: WhereNode[] | null;
  group?: GroupConfigInput | null;
  limit?: Limit;
  search?: string;
  sort?: { property: string; direction: "asc" | "desc" }[];
}

export function ProductsTable({
  filter = null,
  group = null,
  limit = 25,
  search = "",
  sort = [],
}: ProductsTableProps) {
  const trpc = useTRPC();
  const openPreview = useOpenPreview();

  const { controller } = usePageController({
    groupQuery: (params) =>
      trpc.product.getGroup.infiniteQueryOptions(
        { ...params, rollups: productRollups },
        {
          getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
        }
      ),

    dataQuery: (params) =>
      trpc.product.getMany.queryOptions({
        ...params,
        rollups: productRollups,
      }),
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
        sort,
      }}
      properties={productsTableProperties}
    >
      <NotionToolbar enableSettings>
        <DataViewTab options={productsPresets} />
      </NotionToolbar>
      <TableView
        bulkActions={productsTableBulkActions}
        onRowClick={(item) => openPreview.product(item.id)}
        pagination="page"
        showVerticalLines={false}
        stickyHeader={{ enabled: true, offset: 0 }}
      />
    </DataViewProvider>
  );
}
