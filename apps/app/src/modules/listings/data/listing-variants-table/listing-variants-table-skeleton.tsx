"use client";

import { TableSkeleton } from "@sparkyidea/dataview/skeletons";
import { listingVariantsTableProperties } from "./listing-variants-table-properties";

export function ListingVariantsTableSkeleton() {
  return (
    <TableSkeleton properties={listingVariantsTableProperties} rowCount={3} />
  );
}
