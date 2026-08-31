"use client";

import { SimpleDataViewProvider } from "@sparkyidea/dataview/providers";
import { ListView } from "@sparkyidea/dataview/views/list-view";
import { useOpenPreview } from "@/hooks/use-open-preview";
import type { ListingRecentSoldOrderLine } from "@/modules/listings/types";
import { recentOrdersListProperties } from "./recent-orders-list-properties";

export function RecentOrdersList({
  orderLines,
}: {
  orderLines: ListingRecentSoldOrderLine[];
}) {
  const openPreview = useOpenPreview();

  return (
    <SimpleDataViewProvider
      className="rounded-lg border bg-card p-1"
      data={orderLines}
      properties={recentOrdersListProperties}
    >
      <ListView
        onItemClick={(item: { order: { id: string } }) =>
          openPreview.order(item.order.id)
        }
      />
    </SimpleDataViewProvider>
  );
}
