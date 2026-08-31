"use client";

import { TableSkeleton, ToolbarSkeleton } from "@sparkyidea/dataview/skeletons";
import { inventoryTransactionsTableProperties } from "./inventory-transactions-table-properties";

export function InventoryTransactionsTableSkeleton() {
  return (
    <>
      <ToolbarSkeleton enableSettings />
      <TableSkeleton
        pagination="page"
        properties={inventoryTransactionsTableProperties}
        rowCount={25}
      />
    </>
  );
}
