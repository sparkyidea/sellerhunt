"use client";

import { SimpleDataViewProvider } from "@sparkyidea/dataview/providers";
import { TableView } from "@sparkyidea/dataview/views/table-view";
import { useOpenPreview } from "@/hooks/use-open-preview";
import type { ListingData } from "@/modules/listings/types";
import {
  type ListingVariantRow,
  listingVariantsTableProperties,
  toListingVariantRow,
} from "./listing-variants-table-properties";

export function ListingVariantsTable({ listing }: { listing: ListingData }) {
  const openPreview = useOpenPreview();
  const rows = listing.listingVariants.map(toListingVariantRow);

  return (
    <SimpleDataViewProvider
      className="rounded-lg border bg-card p-1"
      data={rows}
      properties={listingVariantsTableProperties}
    >
      <TableView
        onRowClick={(row: ListingVariantRow) =>
          openPreview.listingVariant(row.id, listing.id)
        }
        showVerticalLines={false}
      />
    </SimpleDataViewProvider>
  );
}
