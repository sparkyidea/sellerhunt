"use client";

import { TableSkeleton, ToolbarSkeleton } from "@sparkyidea/dataview/skeletons";
import { ordersTableProperties } from "./orders-table-properties";

export function OrdersTableSkeleton() {
  return (
    <>
      <ToolbarSkeleton enableSettings tabCount={6} />
      <TableSkeleton
        bulkActions
        pagination="page"
        properties={ordersTableProperties}
        rowCount={25}
      />
    </>
  );
}
