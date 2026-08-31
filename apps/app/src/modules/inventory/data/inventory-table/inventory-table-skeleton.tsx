"use client";

import { TableSkeleton, ToolbarSkeleton } from "@sparkyidea/dataview/skeletons";
import { inventoryTableProperties } from "./inventory-table-properties";

export function InventoryTableSkeleton() {
  return (
    <>
      <ToolbarSkeleton enableSettings />
      <TableSkeleton
        bulkActions
        pagination="page"
        properties={inventoryTableProperties}
        rowCount={25}
      />
    </>
  );
}
