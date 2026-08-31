"use client";

import { TableSkeleton, ToolbarSkeleton } from "@sparkyidea/dataview/skeletons";
import { shipmentsTableProperties } from "./shipments-table-properties";

export function ShipmentsTableSkeleton() {
  return (
    <>
      <ToolbarSkeleton enableSettings tabCount={4} />
      <TableSkeleton
        bulkActions
        pagination="page"
        properties={shipmentsTableProperties}
        rowCount={25}
      />
    </>
  );
}
