"use client";

import { TableSkeleton, ToolbarSkeleton } from "@sparkyidea/dataview/skeletons";
import { productsTableProperties } from "./products-table-properties";

export function ProductsTableSkeleton() {
  return (
    <>
      <ToolbarSkeleton enableSettings />
      <TableSkeleton
        bulkActions
        pagination="page"
        properties={productsTableProperties}
        rowCount={25}
      />
    </>
  );
}
