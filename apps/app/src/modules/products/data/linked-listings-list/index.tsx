"use client";

import { SimpleDataViewProvider } from "@sparkyidea/dataview/providers";
import { ListView } from "@sparkyidea/dataview/views/list-view";
import { useOpenPreview } from "@/hooks/use-open-preview";
import type { ProductData } from "../../types";
import { linkedListingsListProperties } from "./linked-listings-list-properties";

export function LinkedListingsList({
  listings,
}: {
  listings: ProductData["listings"];
}) {
  const openPreview = useOpenPreview();

  return (
    <SimpleDataViewProvider
      className="rounded-lg border bg-card p-1"
      data={listings}
      properties={linkedListingsListProperties}
    >
      <ListView
        onItemClick={(item: { id: string }) => openPreview.listing(item.id)}
        showHorizontalLines
      />
    </SimpleDataViewProvider>
  );
}
