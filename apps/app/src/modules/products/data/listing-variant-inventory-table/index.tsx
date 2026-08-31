"use client";

import { SimpleDataViewProvider } from "@sparkyidea/dataview/providers";
import { TableView } from "@sparkyidea/dataview/views/table-view";
import {
  listingVariantInventoryTableProperties,
  toListingVariantInventoryRow,
} from "./listing-variant-inventory-table-properties";

interface StockRecord {
  id: string;
  quantity: number;
  reservedQuantity: number;
  warehouse: {
    id: string;
    address1: string;
    city: string;
    state: string;
  } | null;
}

interface VariantWithStock {
  stockItems: StockRecord[];
}

export function ListingVariantInventoryTable({
  variant,
}: {
  variant: VariantWithStock;
}) {
  const rows = variant.stockItems.map(toListingVariantInventoryRow);

  return (
    <SimpleDataViewProvider
      className="rounded-lg border bg-card p-1"
      data={rows}
      properties={listingVariantInventoryTableProperties}
    >
      <TableView showVerticalLines={false} />
    </SimpleDataViewProvider>
  );
}
