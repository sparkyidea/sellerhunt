"use client";

import { SimpleDataViewProvider } from "@sparkyidea/dataview/providers";
import { TableView } from "@sparkyidea/dataview/views/table-view";
import { useOpenPreview } from "@/hooks/use-open-preview";
import type { ProductData } from "../../types";
import {
  type ListingVariantsInventoryRow,
  listingVariantsInventoryTableProperties,
  toListingVariantsInventoryRows,
} from "./listing-variants-inventory-table-properties";

export function ListingVariantsInventoryTable({
  product,
}: {
  product: ProductData;
}) {
  const openPreview = useOpenPreview();
  const rows = toListingVariantsInventoryRows(product.productVariants);

  return (
    <SimpleDataViewProvider
      className="rounded-lg border bg-card p-1"
      data={rows}
      defaults={{ group: { propertyId: "warehouse", sort: "asc" } }}
      properties={listingVariantsInventoryTableProperties}
    >
      <TableView
        onRowClick={(row: ListingVariantsInventoryRow) =>
          openPreview.productVariant(row.variantId, product.id)
        }
        showVerticalLines={false}
      />
    </SimpleDataViewProvider>
  );
}
