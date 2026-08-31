"use client";

import { TableSkeleton } from "@sparkyidea/dataview/skeletons";
import { listingVariantInventoryTableProperties } from "./listing-variant-inventory-table-properties";

export function ListingVariantInventoryTableSkeleton() {
  return (
    <TableSkeleton
      properties={listingVariantInventoryTableProperties}
      rowCount={2}
    />
  );
}
