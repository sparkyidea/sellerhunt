"use client";

import { SimpleDataViewProvider } from "@sparkyidea/dataview/providers";
import { ListView } from "@sparkyidea/dataview/views/list-view";
import { useOpenPreview } from "@/hooks/use-open-preview";
import type { ListingData } from "@/modules/listings/types";
import { linkedProductListProperties } from "./linked-product-list-properties";

export function LinkedProductList({
  product,
}: {
  product: NonNullable<ListingData["product"]>;
}) {
  const openPreview = useOpenPreview();

  return (
    <SimpleDataViewProvider
      className="rounded-lg border bg-card p-1"
      data={[product]}
      properties={linkedProductListProperties}
    >
      <ListView
        onItemClick={(item: { id: string }) => openPreview.product(item.id)}
      />
    </SimpleDataViewProvider>
  );
}
