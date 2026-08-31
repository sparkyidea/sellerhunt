"use client";

import { usePageController } from "@sparkyidea/dataview/hooks";
import { DataViewProvider } from "@sparkyidea/dataview/providers";
import { NotionToolbar } from "@sparkyidea/dataview/toolbars/notion";
import type { Limit, WhereNode } from "@sparkyidea/dataview/types";
import { getScalarRollups } from "@sparkyidea/dataview/types";
import { TableView } from "@sparkyidea/dataview/views/table-view";
import { useTRPC } from "@/lib/utils/trpc/client";
import { inventoryTransactionsTableProperties } from "./inventory-transactions-table-properties";

const inventoryTransactionRollups = getScalarRollups(
  inventoryTransactionsTableProperties
);

interface InventoryTransactionsTableProps {
  filter?: WhereNode[] | null;
  limit?: Limit;
  productVariantId?: string;
  search?: string;
  sort?: { property: string; direction: "asc" | "desc" }[];
}

export function InventoryTransactionsTable({
  filter = null,
  limit = 25,
  productVariantId,
  search = "",
  sort = [{ property: "createdAt", direction: "desc" }],
}: InventoryTransactionsTableProps) {
  const trpc = useTRPC();

  const { controller } = usePageController({
    groupQuery: (params) =>
      trpc.stockTransaction.getGroup.infiniteQueryOptions(
        {
          ...params,
          productVariantId,
          rollups: inventoryTransactionRollups,
        },
        {
          getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
        }
      ),

    dataQuery: (params) =>
      trpc.stockTransaction.getMany.queryOptions({
        ...params,
        productVariantId,
        rollups: inventoryTransactionRollups,
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
      properties={inventoryTransactionsTableProperties}
    >
      <NotionToolbar enableSettings />
      <TableView
        pagination="page"
        showVerticalLines={false}
        stickyHeader={{ enabled: true, offset: 0 }}
      />
    </DataViewProvider>
  );
}
