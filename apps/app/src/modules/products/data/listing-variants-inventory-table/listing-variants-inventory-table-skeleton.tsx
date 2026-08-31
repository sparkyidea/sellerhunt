"use client";

import { TableSkeleton } from "@sparkyidea/dataview/skeletons";
import { listingVariantsInventoryTableProperties } from "./listing-variants-inventory-table-properties";

export function ListingVariantsInventoryTableSkeleton() {
  return (
    <TableSkeleton
      properties={listingVariantsInventoryTableProperties}
      rowCount={3}
    />
  );
}
